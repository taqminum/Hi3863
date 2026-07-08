#include "cloud_uplink.h"
#include "cloud_config.h"

#include <stdio.h>
#include <string.h>

#ifndef CLOUD_UPLINK_HOST_TEST
#include "soc_osal.h"
#include "lwip/sockets.h"
#include "lwip/nettool/misc.h"
#include "telemetry_cache.h"
#endif

#define CLOUD_UPLINK_PATH_MAX       160
#define CLOUD_UPLINK_BODY_MAX       512
#define CLOUD_UPLINK_REQUEST_MAX    1024
#define CLOUD_UPLINK_RESPONSE_MAX   192

#ifndef CLOUD_UPLINK_HOST_TEST
#define CLOUD_UPLINK_LOG            "[cloud_uplink]"
#define CLOUD_UPLINK_STACK_SIZE     0x1800
#define CLOUD_UPLINK_PRIO           26
#define CLOUD_UPLINK_BOOT_WAIT_MS   6000
#define CLOUD_UPLINK_LOOP_WAIT_MS   3000
#define CLOUD_UPLINK_RETRY_WAIT_MS  8000
#define CLOUD_UPLINK_RECV_TIMEOUT_S 3
#endif

static int cloud_uplink_build_path(char *out, size_t out_size)
{
    int len = snprintf(out, out_size, "%s/api/ingest/base-stations/%s/telemetry",
        CLOUD_UPLINK_BASE_PATH, CLOUD_UPLINK_BASE_STATION);
    if (len < 0 || (size_t)len >= out_size) {
        return -1;
    }
    return len;
}

int cloud_uplink_build_body(const char *telemetry_json, char *out, size_t out_size)
{
    size_t len;
    int written;

    if (telemetry_json == NULL || out == NULL || out_size == 0) {
        return -1;
    }

    len = strlen(telemetry_json);
    if (len < 2 || telemetry_json[0] != '{') {
        return -1;
    }

    written = snprintf(out, out_size, "{\"deviceId\":\"%s\",%s",
        CLOUD_UPLINK_DEVICE_ID, telemetry_json + 1);
    if (written < 0 || (size_t)written >= out_size) {
        return -1;
    }
    return written;
}

int cloud_uplink_build_request(const char *body, char *out, size_t out_size)
{
    char path[CLOUD_UPLINK_PATH_MAX] = {0};
    int path_len;
    int len;

    if (body == NULL || out == NULL || out_size == 0) {
        return -1;
    }

    path_len = cloud_uplink_build_path(path, sizeof(path));
    if (path_len <= 0) {
        return -1;
    }

    len = snprintf(out, out_size,
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "Content-Type: application/json\r\n"
        "X-Device-Key: %s\r\n"
        "Connection: close\r\n"
        "Content-Length: %u\r\n"
        "\r\n"
        "%s",
        path,
        CLOUD_UPLINK_HOST,
        CLOUD_UPLINK_DEVICE_KEY,
        (unsigned int)strlen(body),
        body);
    if (len < 0 || (size_t)len >= out_size) {
        return -1;
    }
    return len;
}

#ifndef CLOUD_UPLINK_HOST_TEST
static int cloud_uplink_send_all(int sock_fd, const char *data, int len)
{
    int sent_total = 0;

    while (sent_total < len) {
        int sent = send(sock_fd, data + sent_total, (size_t)(len - sent_total), 0);
        if (sent <= 0) {
            return -1;
        }
        sent_total += sent;
    }

    return 0;
}

static int cloud_uplink_post_once(const char *telemetry_json)
{
    char body[CLOUD_UPLINK_BODY_MAX] = {0};
    char request[CLOUD_UPLINK_REQUEST_MAX] = {0};
    char response[CLOUD_UPLINK_RESPONSE_MAX] = {0};
    struct sockaddr_in addr = {0};
    struct timeval timeout = {0};
    int body_len;
    int request_len;
    int sock_fd;
    int recv_len;

    body_len = cloud_uplink_build_body(telemetry_json, body, sizeof(body));
    if (body_len <= 0) {
        osal_printk("%s build body failed\r\n", CLOUD_UPLINK_LOG);
        return -1;
    }

    request_len = cloud_uplink_build_request(body, request, sizeof(request));
    if (request_len <= 0) {
        osal_printk("%s build request failed\r\n", CLOUD_UPLINK_LOG);
        return -1;
    }

    sock_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (sock_fd < 0) {
        osal_printk("%s socket create failed\r\n", CLOUD_UPLINK_LOG);
        return -1;
    }

    timeout.tv_sec = CLOUD_UPLINK_RECV_TIMEOUT_S;
    timeout.tv_usec = 0;
    (void)setsockopt(sock_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    addr.sin_family = AF_INET;
    addr.sin_port = htons(CLOUD_UPLINK_PORT);
    addr.sin_addr.s_addr = inet_addr(CLOUD_UPLINK_HOST_IP);

    if (connect(sock_fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        osal_printk("%s connect %s:%d failed\r\n", CLOUD_UPLINK_LOG,
            CLOUD_UPLINK_HOST_IP, CLOUD_UPLINK_PORT);
        lwip_close(sock_fd);
        return -1;
    }

    if (cloud_uplink_send_all(sock_fd, request, request_len) != 0) {
        osal_printk("%s send failed\r\n", CLOUD_UPLINK_LOG);
        lwip_close(sock_fd);
        return -1;
    }

    recv_len = recv(sock_fd, response, sizeof(response) - 1, 0);
    lwip_close(sock_fd);

    if (recv_len <= 0) {
        osal_printk("%s no response\r\n", CLOUD_UPLINK_LOG);
        return -1;
    }
    response[recv_len] = '\0';

    if (strstr(response, " 200 ") != NULL || strstr(response, " 201 ") != NULL) {
        osal_printk("%s uploaded telemetry, bytes=%d\r\n", CLOUD_UPLINK_LOG, body_len);
        return 0;
    }

    osal_printk("%s upload rejected: %.64s\r\n", CLOUD_UPLINK_LOG, response);
    return -1;
}

static void *cloud_uplink_task(const char *arg)
{
    char telemetry[CLOUD_UPLINK_BODY_MAX] = {0};
    char last_uploaded[CLOUD_UPLINK_BODY_MAX] = {0};

    unused(arg);
    osal_msleep(CLOUD_UPLINK_BOOT_WAIT_MS);
    osal_printk("%s start http://%s%s base=%s device=%s\r\n", CLOUD_UPLINK_LOG,
        CLOUD_UPLINK_HOST, CLOUD_UPLINK_BASE_PATH, CLOUD_UPLINK_BASE_STATION,
        CLOUD_UPLINK_DEVICE_ID);

    while (1) {
        (void)memset(telemetry, 0, sizeof(telemetry));
        if (telemetry_cache_get(telemetry, sizeof(telemetry)) <= 0) {
            osal_msleep(CLOUD_UPLINK_LOOP_WAIT_MS);
            continue;
        }

        if (strcmp(telemetry, last_uploaded) == 0) {
            osal_msleep(CLOUD_UPLINK_LOOP_WAIT_MS);
            continue;
        }

        if (cloud_uplink_post_once(telemetry) == 0) {
            (void)snprintf(last_uploaded, sizeof(last_uploaded), "%s", telemetry);
            osal_msleep(CLOUD_UPLINK_LOOP_WAIT_MS);
        } else {
            osal_msleep(CLOUD_UPLINK_RETRY_WAIT_MS);
        }
    }

    return NULL;
}

void cloud_uplink_start(void)
{
    osal_task *task_handle = osal_kthread_create((osal_kthread_handler)cloud_uplink_task, 0,
        "GateCloudTask", CLOUD_UPLINK_STACK_SIZE);
    if (task_handle == NULL) {
        osal_printk("%s task create failed\r\n", CLOUD_UPLINK_LOG);
        return;
    }
    osal_kthread_set_priority(task_handle, CLOUD_UPLINK_PRIO);
}
#endif
