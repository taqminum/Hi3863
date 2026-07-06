#include "wifi_ap.h"

#include "control_command.h"
#include "cmsis_os2.h"
#include "lwip/netifapi.h"
#include "lwip/sockets.h"
#include "wifi_hotspot.h"
#include "wifi_hotspot_config.h"

#include "../patrol/patrol_route.h"

#include "stdio.h"
#include "string.h"

#define CAR_WIFI_AP_TASK_STACK_SIZE 0x1200
#define CAR_WIFI_AP_WAIT_INIT_MS 100U
#define CAR_WIFI_AP_WAIT_INIT_RETRIES 100U
#define CAR_WIFI_AP_SSID "WS63E_ENV_CAR"
#define CAR_WIFI_AP_PSK "12345678"
#define CAR_WIFI_AP_IFNAME "ap0"
#define CAR_WIFI_AP_CHANNEL 6
#define CAR_WIFI_AP_IP "192.168.5.1"
#define CAR_WIFI_AP_HTTP_PORT 8080
#define CAR_WIFI_AP_JSON_MAX_LEN 192
#define CAR_WIFI_AP_HTTP_BUF_LEN 512
#define CAR_WIFI_AP_HTTP_TASK_STACK_SIZE 0x1800

static const char g_root_html[] =
    "<!doctype html><html><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>WS63E Env Car</title>"
    "<style>"
    "body{font-family:Arial,sans-serif;margin:16px;background:#f3f5f7;color:#1f2937;}"
    "h1{font-size:20px;margin:0 0 12px;} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:360px;}"
    ".card{background:#fff;padding:10px 12px;border:1px solid #d0d7de;border-radius:6px;}"
    ".label{font-size:12px;color:#6b7280;} .value{font-size:18px;font-weight:700;margin-top:4px;}"
    ".motion{margin:12px 0;font-size:14px;} .controls{display:grid;grid-template-columns:repeat(3,88px);gap:8px;align-items:center;}"
    "button{height:40px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;}"
    "button.secondary{background:#fff;color:#2563eb;} pre{background:#111827;color:#e5e7eb;padding:10px;border-radius:6px;overflow:auto;max-width:360px;}"
    "</style></head><body><h1>WS63E Env Car</h1>"
    "<div class=\"grid\"><div class=\"card\"><div class=\"label\">Temperature</div><div class=\"value\" id=\"temp\">--.- C</div></div>"
    "<div class=\"card\"><div class=\"label\">Humidity</div><div class=\"value\" id=\"humi\">--.- %</div></div>"
    "<div class=\"card\"><div class=\"label\">Light</div><div class=\"value\" id=\"light\">----.- lx</div></div>"
    "<div class=\"card\"><div class=\"label\">Sequence</div><div class=\"value\" id=\"seq\">0</div></div>"
    "<div class=\"card\"><div class=\"label\">Analysis</div><div class=\"value\" id=\"alert\">NORMAL</div></div></div>"
    "<div class=\"motion\">Motion: <strong id=\"motion\">STOP</strong></div>"
    "<div class=\"controls\">"
    "<span></span><button onclick=\"sendCommand('forward')\">Forward</button><span></span>"
    "<button onclick=\"sendCommand('left')\">Left</button><button class=\"secondary\" onclick=\"sendCommand('stop')\">Stop</button><button onclick=\"sendCommand('right')\">Right</button>"
    "<span></span><button onclick=\"sendCommand('backward')\">Backward</button><span></span>"
    "</div><div class=\"controls\" style=\"margin-top:8px;grid-template-columns:repeat(2,136px);\">"
    "<button onclick=\"sendCommand('auto_start')\">Auto Start</button><button class=\"secondary\" onclick=\"sendCommand('auto_stop')\">Auto Stop</button>"
    "</div><p id=\"status\">Waiting for telemetry...</p><pre id=\"raw\">{}</pre>"
    "<script>"
    "function motionLabel(v){return ['STOP','FORWARD','BACKWARD','LEFT','RIGHT'][v]||'UNKNOWN';}"
    "function render(data){document.getElementById('seq').textContent=data.seq??0;"
    "document.getElementById('temp').textContent=((data.temp_x10??0)/10).toFixed(1)+' C';"
    "document.getElementById('humi').textContent=((data.humi_x10??0)/10).toFixed(1)+' %';"
    "document.getElementById('light').textContent=((data.light_x10??0)/10).toFixed(1)+' lx';"
    "document.getElementById('motion').textContent=motionLabel(data.motion);"
    "var alerts=[]; if(data.temp_alert){alerts.push('TEMP');} if(data.humi_alert){alerts.push('HUMI');} if(data.light_alert){alerts.push('LIGHT');}"
    "document.getElementById('alert').textContent=alerts.length?alerts.join('+'):'NORMAL';"
    "document.getElementById('raw').textContent=JSON.stringify(data,null,2);"
    "document.getElementById('status').textContent='Telemetry updated patrol='+(data.patrol?'ON':'OFF')+' alert='+(alerts.length?alerts.join('+'):'NORMAL');}"
    "function pollTelemetry(){fetch('/api/data').then(function(r){return r.json();}).then(render)"
    ".catch(function(){document.getElementById('status').textContent='Telemetry request failed';});}"
    "function sendCommand(cmd){fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},"
    "body:JSON.stringify({cmd:cmd,speed:35,duration_ms:600})}).then(function(r){return r.text();})"
    ".then(function(text){document.getElementById('status').textContent='Command sent: '+cmd+' '+text; pollTelemetry();})"
    ".catch(function(){document.getElementById('status').textContent='Command failed: '+cmd;});}"
    "pollTelemetry();setInterval(pollTelemetry,1000);"
    "</script></body></html>";

static int car_wifi_request_has_token(const char *payload, const char *token)
{
    return (payload != NULL && token != NULL && strstr(payload, token) != NULL) ? 1 : 0;
}

static car_wifi_state_t g_wifi_state = CAR_WIFI_STATE_IDLE;
static char g_last_json[CAR_WIFI_AP_JSON_MAX_LEN];

static int car_wifi_http_send(int fd, const char *response)
{
    size_t len = strlen(response);
    return send(fd, response, len, 0) == (int)len ? 0 : -1;
}

static void car_wifi_http_respond_status(int fd, int code, const char *status, const char *body,
    const char *content_type)
{
    char response[CAR_WIFI_AP_HTTP_BUF_LEN + 128];
    if (body == NULL) {
        body = "";
    }
    if (content_type == NULL) {
        content_type = "text/plain";
    }

    int written = snprintf(response, sizeof(response),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %u\r\n"
        "Connection: close\r\n\r\n"
        "%s",
        code, status, content_type, (unsigned int)strlen(body), body);
    if (written > 0 && (size_t)written < sizeof(response)) {
        (void)car_wifi_http_send(fd, response);
    }
}

static void car_wifi_http_handle_request(int fd, const char *request)
{
    if (request == NULL) {
        car_wifi_http_respond_status(fd, 400, "Bad Request", "bad request\n", "text/plain");
        return;
    }

    if (strncmp(request, "GET /api/data", strlen("GET /api/data")) == 0) {
        const char *json = car_wifi_ap_get_last_json();
        if (json == NULL || json[0] == '\0') {
            json = "{\"err\":\"no telemetry\"}";
        }
        printf("[car] wifi telemetry_request %s\r\n", json);
        car_wifi_http_respond_status(fd, 200, "OK", json, "application/json");
        return;
    }

    if (strncmp(request, "GET / ", strlen("GET / ")) == 0 || strncmp(request, "GET /HTTP", strlen("GET /HTTP")) == 0) {
        car_wifi_http_respond_status(fd, 200, "OK", g_root_html, "text/html");
        return;
    }

    if (strncmp(request, "POST /api/control", strlen("POST /api/control")) == 0) {
        const char *body = strstr(request, "\r\n\r\n");
        if (body == NULL) {
            car_wifi_http_respond_status(fd, 400, "Bad Request", "{\"err\":\"missing body\"}",
                "application/json");
            return;
        }
        body += 4;
        printf("[car] wifi control_request %s\r\n", body);
        if (car_wifi_request_has_token(body, "\"auto_start\"")) {
            patrol_route_start();
            printf("[car] wifi control_result auto_start\r\n");
            car_wifi_http_respond_status(fd, 200, "OK", "{\"ok\":true,\"patrol\":1}", "application/json");
            return;
        }
        if (car_wifi_request_has_token(body, "\"auto_stop\"")) {
            patrol_route_stop();
            printf("[car] wifi control_result auto_stop\r\n");
            car_wifi_http_respond_status(fd, 200, "OK", "{\"ok\":true,\"patrol\":0}", "application/json");
            return;
        }
        patrol_route_stop();
        int ret = control_command_apply(body);
        printf("[car] wifi control_result %d\r\n", ret);
        if (ret != 0) {
            car_wifi_http_respond_status(fd, 400, "Bad Request", "{\"err\":\"control failed\"}",
                "application/json");
            return;
        }
        car_wifi_http_respond_status(fd, 200, "OK", "{\"ok\":true}", "application/json");
        return;
    }

    car_wifi_http_respond_status(fd, 404, "Not Found", "{\"err\":\"not found\"}", "application/json");
}

static void car_wifi_http_server_task(void *arg)
{
    (void)arg;

    int sock_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (sock_fd < 0) {
        printf("[car] wifi http socket create fail\r\n");
        return;
    }

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(CAR_WIFI_AP_HTTP_PORT);
    addr.sin_addr.s_addr = inet_addr(CAR_WIFI_AP_IP);

    if (bind(sock_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        printf("[car] wifi http bind fail\r\n");
        lwip_close(sock_fd);
        return;
    }
    if (listen(sock_fd, 0) != 0) {
        printf("[car] wifi http listen fail\r\n");
        lwip_close(sock_fd);
        return;
    }

    printf("[car] wifi http ready url=http://%s:%u/api/data\r\n", CAR_WIFI_AP_IP, CAR_WIFI_AP_HTTP_PORT);

    while (1) {
        struct sockaddr_in client_addr = {0};
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(sock_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            osDelay(20);
            continue;
        }

        char request[CAR_WIFI_AP_HTTP_BUF_LEN] = {0};
        int recv_len = recv(client_fd, request, sizeof(request) - 1, 0);
        if (recv_len > 0) {
            request[recv_len] = '\0';
            car_wifi_http_handle_request(client_fd, request);
        }
        lwip_close(client_fd);
    }
}

static void car_wifi_http_server_start(void)
{
    osThreadAttr_t attr = {
        .name = "car_wifi_http",
        .attr_bits = 0U,
        .cb_mem = NULL,
        .cb_size = 0U,
        .stack_mem = NULL,
        .stack_size = CAR_WIFI_AP_HTTP_TASK_STACK_SIZE,
        .priority = osPriorityNormal,
    };

    if (osThreadNew((osThreadFunc_t)car_wifi_http_server_task, NULL, &attr) == NULL) {
        printf("[car] create wifi http task fail\r\n");
    }
}

static int car_wifi_ap_enable_softap(void)
{
    softap_config_stru hapd_conf = {0};
    softap_config_advance_stru config = {0};
    struct netif *netif_p = NULL;
    ip4_addr_t st_gw = {0};
    ip4_addr_t st_ipaddr = {0};
    ip4_addr_t st_netmask = {0};

    IP4_ADDR(&st_ipaddr, 192, 168, 5, 1);
    IP4_ADDR(&st_netmask, 255, 255, 255, 0);
    IP4_ADDR(&st_gw, 192, 168, 5, 2);

    (void)memcpy_s(hapd_conf.ssid, sizeof(hapd_conf.ssid), CAR_WIFI_AP_SSID, sizeof(CAR_WIFI_AP_SSID));
    (void)memcpy_s(hapd_conf.pre_shared_key, WIFI_MAX_KEY_LEN, CAR_WIFI_AP_PSK, sizeof(CAR_WIFI_AP_PSK));
    hapd_conf.security_type = WIFI_SEC_TYPE_WPA2_WPA_PSK_MIX;
    hapd_conf.channel_num = CAR_WIFI_AP_CHANNEL;
    hapd_conf.wifi_psk_type = 0;

    config.beacon_interval = 100;
    config.dtim_period = 2;
    config.gi = 0;
    config.group_rekey = 86400;
    config.protocol_mode = 4;
    config.hidden_ssid_flag = 1;

    if (wifi_set_softap_config_advance(&config) != 0) {
        printf("[car] wifi ap advance config fail\r\n");
        return -1;
    }
    if (wifi_softap_enable(&hapd_conf) != 0) {
        printf("[car] wifi ap enable fail\r\n");
        return -1;
    }

    netif_p = netif_find(CAR_WIFI_AP_IFNAME);
    if (netif_p == NULL) {
        printf("[car] wifi ap netif find fail\r\n");
        (void)wifi_softap_disable();
        return -1;
    }
    if (netifapi_netif_set_addr(netif_p, &st_ipaddr, &st_netmask, &st_gw) != 0) {
        printf("[car] wifi ap set addr fail\r\n");
        (void)wifi_softap_disable();
        return -1;
    }
    if (netifapi_dhcps_start(netif_p, NULL, 0) != 0) {
        printf("[car] wifi ap dhcps start fail\r\n");
        (void)wifi_softap_disable();
        return -1;
    }

    printf("[car] wifi ap ready ssid=%s ip=%s\r\n", CAR_WIFI_AP_SSID, CAR_WIFI_AP_IP);
    return 0;
}

static void car_wifi_ap_task(void *arg)
{
    (void)arg;
    g_wifi_state = CAR_WIFI_STATE_STARTING;

    for (uint32_t i = 0; i < CAR_WIFI_AP_WAIT_INIT_RETRIES; i++) {
        if (wifi_is_wifi_inited() != 0) {
            break;
        }
        osDelay(CAR_WIFI_AP_WAIT_INIT_MS);
    }

    if (wifi_is_wifi_inited() == 0) {
        g_wifi_state = CAR_WIFI_STATE_ERROR;
        printf("[car] wifi ap init timeout\r\n");
        return;
    }

    if (car_wifi_ap_enable_softap() != 0) {
        g_wifi_state = CAR_WIFI_STATE_ERROR;
        return;
    }

    g_wifi_state = CAR_WIFI_STATE_READY;
    car_wifi_http_server_start();
}

int car_wifi_ap_start(void)
{
    if (g_wifi_state == CAR_WIFI_STATE_STARTING || g_wifi_state == CAR_WIFI_STATE_READY) {
        return 0;
    }

    osThreadAttr_t attr = {
        .name = "car_wifi_ap",
        .attr_bits = 0U,
        .cb_mem = NULL,
        .cb_size = 0U,
        .stack_mem = NULL,
        .stack_size = CAR_WIFI_AP_TASK_STACK_SIZE,
        .priority = osPriorityNormal,
    };

    if (osThreadNew((osThreadFunc_t)car_wifi_ap_task, NULL, &attr) == NULL) {
        printf("[car] create wifi ap task fail\r\n");
        g_wifi_state = CAR_WIFI_STATE_ERROR;
        return -1;
    }

    return 0;
}

car_wifi_state_t car_wifi_ap_get_state(void)
{
    return g_wifi_state;
}

int car_wifi_ap_publish_json(const char *json)
{
    if (json == NULL) {
        return -1;
    }

    int ret = memcpy_s(g_last_json, sizeof(g_last_json), json, strnlen(json, sizeof(g_last_json) - 1U) + 1U);
    if (ret != 0) {
        g_last_json[0] = '\0';
        return -1;
    }
    return 0;
}

const char *car_wifi_ap_get_last_json(void)
{
    return g_last_json;
}
