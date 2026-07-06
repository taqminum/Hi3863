#include "sle_client.h"

#include "control_command.h"
#include "../patrol/patrol_route.h"

#include "bts_le_gap.h"
#include "cmsis_os2.h"
#include "common_def.h"
#include "errcode.h"
#include "securec.h"
#include "sle_connection_manager.h"
#include "sle_device_discovery.h"
#include "sle_ssap_client.h"

#include "stdio.h"
#include "string.h"

#define CAR_SLE_TARGET_NAME "sle_uart_server"
#define CAR_SLE_MTU_SIZE 520
#define CAR_SLE_SEEK_INTERVAL 100
#define CAR_SLE_SEEK_WINDOW 100
#define CAR_SLE_INIT_DELAY_MS 5000U
#define CAR_SLE_TASK_STACK_SIZE 0x1800
#define CAR_SLE_TEXT_MAX_LEN 180U

static car_sle_state_t g_sle_state = CAR_SLE_STATE_IDLE;
static sle_announce_seek_callbacks_t g_sle_seek_cbk = {0};
static sle_connection_callbacks_t g_sle_connect_cbk = {0};
static ssapc_callbacks_t g_sle_ssapc_cbk = {0};
static sle_addr_t g_sle_remote_addr = {0};
static ssapc_write_param_t g_sle_send_param = {0};
static uint16_t g_sle_conn_id = 0;
static uint8_t g_sle_has_write_handle = 0;

static int car_sle_data_contains(const uint8_t *data, uint8_t data_len, const char *needle)
{
    size_t needle_len;
    if (data == NULL || needle == NULL) {
        return 0;
    }

    needle_len = strlen(needle);
    if (needle_len == 0 || needle_len > data_len) {
        return 0;
    }

    for (uint8_t i = 0; i <= (uint8_t)(data_len - needle_len); i++) {
        if (memcmp(&data[i], needle, needle_len) == 0) {
            return 1;
        }
    }
    return 0;
}

static void car_sle_start_scan(void)
{
    sle_seek_param_t param = {0};
    param.own_addr_type = 0;
    param.filter_duplicates = 0;
    param.seek_filter_policy = 0;
    param.seek_phys = 1;
    param.seek_type[0] = 1;
    param.seek_interval[0] = CAR_SLE_SEEK_INTERVAL;
    param.seek_window[0] = CAR_SLE_SEEK_WINDOW;
    (void)sle_set_seek_param(&param);
    (void)sle_start_seek();
    g_sle_state = CAR_SLE_STATE_SCANNING;
    printf("[car][sle] scanning target=%s\r\n", CAR_SLE_TARGET_NAME);
}

static void car_sle_enable_cbk(errcode_t status)
{
    printf("[car][sle] enable status=%d\r\n", status);
    if (status != ERRCODE_SUCC) {
        g_sle_state = CAR_SLE_STATE_ERROR;
        return;
    }
    car_sle_start_scan();
}

static void car_sle_seek_enable_cbk(errcode_t status)
{
    if (status != ERRCODE_SUCC) {
        printf("[car][sle] seek enable failed status=%d\r\n", status);
        g_sle_state = CAR_SLE_STATE_ERROR;
    }
}

static void car_sle_seek_result_cbk(sle_seek_result_info_t *seek_result_data)
{
    if (seek_result_data == NULL || seek_result_data->data == NULL) {
        return;
    }

    if (car_sle_data_contains(seek_result_data->data, seek_result_data->data_length, CAR_SLE_TARGET_NAME) == 0) {
        return;
    }

    printf("[car][sle] found target %s\r\n", CAR_SLE_TARGET_NAME);
    if (memcpy_s(&g_sle_remote_addr, sizeof(g_sle_remote_addr), &seek_result_data->addr,
        sizeof(seek_result_data->addr)) != EOK) {
        printf("[car][sle] copy remote addr failed\r\n");
        g_sle_state = CAR_SLE_STATE_ERROR;
        return;
    }
    (void)sle_stop_seek();
}

static void car_sle_seek_disable_cbk(errcode_t status)
{
    if (status != ERRCODE_SUCC) {
        printf("[car][sle] seek disable failed status=%d\r\n", status);
        g_sle_state = CAR_SLE_STATE_ERROR;
        return;
    }

    (void)sle_remove_paired_remote_device(&g_sle_remote_addr);
    (void)sle_connect_remote_device(&g_sle_remote_addr);
    printf("[car][sle] connect requested\r\n");
}

static void car_sle_seek_cbk_register(void)
{
    g_sle_seek_cbk.sle_enable_cb = car_sle_enable_cbk;
    g_sle_seek_cbk.seek_enable_cb = car_sle_seek_enable_cbk;
    g_sle_seek_cbk.seek_result_cb = car_sle_seek_result_cbk;
    g_sle_seek_cbk.seek_disable_cb = car_sle_seek_disable_cbk;
    (void)sle_announce_seek_register_callbacks(&g_sle_seek_cbk);
}

static void car_sle_connect_state_cbk(uint16_t conn_id, const sle_addr_t *addr,
    sle_acb_state_t conn_state, sle_pair_state_t pair_state, sle_disc_reason_t disc_reason)
{
    unused(addr);
    printf("[car][sle] conn state=%d pair=%d reason=0x%x\r\n", conn_state, pair_state, disc_reason);
    g_sle_conn_id = conn_id;

    if (conn_state == SLE_ACB_STATE_CONNECTED) {
        g_sle_state = CAR_SLE_STATE_CONNECTED;
        if (pair_state == SLE_PAIR_NONE) {
            (void)sle_pair_remote_device(&g_sle_remote_addr);
        }
        return;
    }

    if (conn_state == SLE_ACB_STATE_DISCONNECTED) {
        g_sle_state = CAR_SLE_STATE_SCANNING;
        g_sle_has_write_handle = 0;
        (void)sle_remove_paired_remote_device(&g_sle_remote_addr);
        car_sle_start_scan();
    }
}

static void car_sle_pair_complete_cbk(uint16_t conn_id, const sle_addr_t *addr, errcode_t status)
{
    unused(addr);
    printf("[car][sle] pair complete conn=%u status=%d\r\n", conn_id, status);
    if (status != ERRCODE_SUCC) {
        return;
    }

    ssap_exchange_info_t info = {0};
    info.mtu_size = CAR_SLE_MTU_SIZE;
    info.version = 1;
    (void)ssapc_exchange_info_req(0, g_sle_conn_id, &info);
}

static void car_sle_connect_cbk_register(void)
{
    g_sle_connect_cbk.connect_state_changed_cb = car_sle_connect_state_cbk;
    g_sle_connect_cbk.pair_complete_cb = car_sle_pair_complete_cbk;
    (void)sle_connection_register_callbacks(&g_sle_connect_cbk);
}

static void car_sle_exchange_info_cbk(uint8_t client_id, uint16_t conn_id,
    ssap_exchange_info_t *param, errcode_t status)
{
    printf("[car][sle] exchange client=%u conn=%u mtu=%u status=%d\r\n",
        client_id, conn_id, param == NULL ? 0U : param->mtu_size, status);
    if (status != ERRCODE_SUCC) {
        return;
    }

    ssapc_find_structure_param_t find_param = {0};
    find_param.type = SSAP_FIND_TYPE_PROPERTY;
    find_param.start_hdl = 1;
    find_param.end_hdl = 0xFFFF;
    (void)ssapc_find_structure(0, conn_id, &find_param);
}

static void car_sle_find_structure_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_find_service_result_t *service, errcode_t status)
{
    printf("[car][sle] service client=%u conn=%u status=%d start=0x%x end=0x%x\r\n",
        client_id, conn_id, status, service == NULL ? 0U : service->start_hdl,
        service == NULL ? 0U : service->end_hdl);
}

static void car_sle_find_property_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_find_property_result_t *property, errcode_t status)
{
    if (property == NULL || status != ERRCODE_SUCC) {
        printf("[car][sle] property failed client=%u conn=%u status=%d\r\n", client_id, conn_id, status);
        return;
    }

    g_sle_send_param.handle = property->handle;
    g_sle_send_param.type = SSAP_PROPERTY_TYPE_VALUE;
    g_sle_has_write_handle = 1;
    printf("[car][sle] write handle=%u ready\r\n", property->handle);
}

static void car_sle_find_structure_cmp_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_find_structure_result_t *structure_result, errcode_t status)
{
    unused(conn_id);
    printf("[car][sle] discovery complete client=%u status=%d type=%u\r\n",
        client_id, status, structure_result == NULL ? 0U : structure_result->type);
}

static void car_sle_write_cfm_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_write_result_t *write_result, errcode_t status)
{
    printf("[car][sle] write cfm client=%u conn=%u status=%d handle=%u\r\n",
        client_id, conn_id, status, write_result == NULL ? 0U : write_result->handle);
}

static void car_sle_apply_rx_text(const uint8_t *data, uint16_t len)
{
    char text[CAR_SLE_TEXT_MAX_LEN];
    uint16_t copy_len = len;
    if (copy_len >= sizeof(text)) {
        copy_len = sizeof(text) - 1U;
    }
    if (memcpy_s(text, sizeof(text), data, copy_len) != EOK) {
        return;
    }
    text[copy_len] = '\0';

    printf("[car][sle] rx %s\r\n", text);
    if (strstr(text, "auto_start") != NULL) {
        patrol_route_start();
        return;
    }
    if (strstr(text, "auto_stop") != NULL) {
        patrol_route_stop();
        return;
    }
    if (strstr(text, "forward") != NULL || strstr(text, "backward") != NULL ||
        strstr(text, "left") != NULL || strstr(text, "right") != NULL || strstr(text, "stop") != NULL) {
        patrol_route_stop();
        (void)control_command_apply(text);
    }
}

static void car_sle_notification_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_handle_value_t *data, errcode_t status)
{
    unused(client_id);
    unused(conn_id);
    if (status != ERRCODE_SUCC || data == NULL || data->data == NULL || data->data_len == 0) {
        return;
    }
    car_sle_apply_rx_text(data->data, data->data_len);
}

static void car_sle_indication_cbk(uint8_t client_id, uint16_t conn_id,
    ssapc_handle_value_t *data, errcode_t status)
{
    car_sle_notification_cbk(client_id, conn_id, data, status);
}

static void car_sle_ssapc_cbk_register(void)
{
    g_sle_ssapc_cbk.exchange_info_cb = car_sle_exchange_info_cbk;
    g_sle_ssapc_cbk.find_structure_cb = car_sle_find_structure_cbk;
    g_sle_ssapc_cbk.ssapc_find_property_cbk = car_sle_find_property_cbk;
    g_sle_ssapc_cbk.find_structure_cmp_cb = car_sle_find_structure_cmp_cbk;
    g_sle_ssapc_cbk.write_cfm_cb = car_sle_write_cfm_cbk;
    g_sle_ssapc_cbk.notification_cb = car_sle_notification_cbk;
    g_sle_ssapc_cbk.indication_cb = car_sle_indication_cbk;
    (void)ssapc_register_callbacks(&g_sle_ssapc_cbk);
}

static void car_sle_task(void *arg)
{
    unused(arg);
    osDelay(CAR_SLE_INIT_DELAY_MS / 10U);
    car_sle_seek_cbk_register();
    car_sle_connect_cbk_register();
    car_sle_ssapc_cbk_register();

    printf("[car][sle] enable request\r\n");
    if (enable_sle() != ERRCODE_SUCC) {
        printf("[car][sle] enable request failed\r\n");
        g_sle_state = CAR_SLE_STATE_ERROR;
    }

    while (1) {
        osDelay(100);
    }
}

int car_sle_client_start(void)
{
    if (g_sle_state == CAR_SLE_STATE_STARTING || g_sle_state == CAR_SLE_STATE_SCANNING ||
        g_sle_state == CAR_SLE_STATE_CONNECTED) {
        return 0;
    }

    g_sle_state = CAR_SLE_STATE_STARTING;
    osThreadAttr_t attr = {
        .name = "car_sle_client",
        .attr_bits = 0U,
        .cb_mem = NULL,
        .cb_size = 0U,
        .stack_mem = NULL,
        .stack_size = CAR_SLE_TASK_STACK_SIZE,
        .priority = osPriorityNormal,
    };

    if (osThreadNew((osThreadFunc_t)car_sle_task, NULL, &attr) == NULL) {
        printf("[car][sle] create task failed\r\n");
        g_sle_state = CAR_SLE_STATE_ERROR;
        return -1;
    }
    return 0;
}

car_sle_state_t car_sle_client_get_state(void)
{
    return g_sle_state;
}

int car_sle_client_send_text(const char *text)
{
    if (text == NULL || g_sle_state != CAR_SLE_STATE_CONNECTED || g_sle_has_write_handle == 0) {
        return -1;
    }

    size_t len = strnlen(text, CAR_SLE_TEXT_MAX_LEN);
    if (len == 0 || len >= CAR_SLE_TEXT_MAX_LEN) {
        return -1;
    }

    g_sle_send_param.data_len = (uint16_t)len;
    g_sle_send_param.data = (uint8_t *)text;
    return ssapc_write_cmd(0, g_sle_conn_id, &g_sle_send_param);
}
