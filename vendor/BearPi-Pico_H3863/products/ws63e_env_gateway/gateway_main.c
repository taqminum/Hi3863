/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: WS63E Environment Gateway - BearPi-Pico H3863
 *              Wi-Fi AP + SLE Server gateway for WS63E patrol car.
 * History:
 * 2026-07-06, Create file.
 */
#include "common_def.h"
#include "soc_osal.h"
#include "app_init.h"
#include "securec.h"
#include "sle_errcode.h"
#include "sle_device_discovery.h"
#include "sle_uart_server.h"
#include "sle_uart_server_adv.h"
#include "wifi_softap.h"
#include "wifi_router_sta.h"
#include "telemetry_cache.h"
#include "udp_bridge.h"

#define GATEWAY_SLE_STACK_SIZE              0x1200
#define GATEWAY_UDP_STACK_SIZE              0x1000
#define GATEWAY_SLE_PRIO                    28
#define GATEWAY_UDP_PRIO                    27
#define SLE_ADV_HANDLE_DEFAULT              1

#define GATEWAY_SLE_MSG_QUEUE_LEN           5
#define GATEWAY_SLE_MSG_QUEUE_MAX_SIZE      32
#define GATEWAY_SLE_QUEUE_DELAY             0xFFFFFFFF
#define GATEWAY_SLE_TASK_INTERVAL_MS        2000

#define GATEWAY_LOG                         "[ws63e_gateway]"

static unsigned long g_gateway_sle_msgqueue_id;

/* ---------- SLE Server callbacks (wired to gateway logic) ---------- */

static void gateway_read_request_cbk(uint8_t server_id, uint16_t conn_id,
    ssaps_req_read_cb_t *read_cb_para, errcode_t status)
{
    osal_printk("%s ssaps read request server_id:%x conn_id:%x handle:%x status:%x\r\n",
        GATEWAY_LOG, server_id, conn_id, read_cb_para->handle, status);
}

static void gateway_write_request_cbk(uint8_t server_id, uint16_t conn_id,
    ssaps_req_write_cb_t *write_cb_para, errcode_t status)
{
    osal_printk("%s ssaps write request server_id:%x conn_id:%x handle:%x status:%x\r\n",
        GATEWAY_LOG, server_id, conn_id, write_cb_para->handle, status);
    if (write_cb_para->length > 0 && write_cb_para->value) {
        osal_printk("%s rx telemetry: %s\r\n", GATEWAY_LOG, write_cb_para->value);
        telemetry_cache_update(write_cb_para->value, write_cb_para->length);
    }
}

/* ---------- Message queue helpers (same pattern as sle_gateway server) ---------- */

static void gateway_sle_msgqueue_create(void)
{
    if (osal_msg_queue_create("gateway_sle_msgqueue",
        GATEWAY_SLE_MSG_QUEUE_LEN,
        &g_gateway_sle_msgqueue_id, 0,
        GATEWAY_SLE_MSG_QUEUE_MAX_SIZE) != OSAL_SUCCESS) {
        osal_printk("%s msg queue create failed\r\n", GATEWAY_LOG);
    }
}

static void gateway_sle_msgqueue_delete(void)
{
    osal_msg_queue_delete(g_gateway_sle_msgqueue_id);
}

static void gateway_sle_msgqueue_write(uint8_t *buffer_addr, uint16_t buffer_size)
{
    osal_msg_queue_write_copy(g_gateway_sle_msgqueue_id,
        (void *)buffer_addr, (uint32_t)buffer_size, 0);
}

static int32_t gateway_sle_msgqueue_read(uint8_t *buffer_addr, uint32_t *buffer_size)
{
    return osal_msg_queue_read_copy(g_gateway_sle_msgqueue_id,
        (void *)buffer_addr, buffer_size, GATEWAY_SLE_QUEUE_DELAY);
}

/* ---------- SLE Server task ---------- */

static void *sle_server_task(const char *arg)
{
    unused(arg);
    uint8_t rx_buf[GATEWAY_SLE_MSG_QUEUE_MAX_SIZE] = {0};
    uint32_t rx_length = GATEWAY_SLE_MSG_QUEUE_MAX_SIZE;
    uint8_t sle_connect_state[] = "sle_dis_connect";
    errcode_t ret;

    telemetry_cache_init();

    gateway_sle_msgqueue_create();
    sle_uart_server_register_msg(gateway_sle_msgqueue_write);

    ret = sle_uart_server_init(gateway_read_request_cbk, gateway_write_request_cbk);
    if (ret != ERRCODE_SLE_SUCCESS) {
        osal_printk("%s SLE server init failed: %x\r\n", GATEWAY_LOG, ret);
        gateway_sle_msgqueue_delete();
        return NULL;
    }
    osal_printk("%s SLE server init OK, advertising as sle_uart_server\r\n", GATEWAY_LOG);

    while (1) {
        (void)memset_s(rx_buf, sizeof(rx_buf), 0, sizeof(rx_buf));
        rx_length = GATEWAY_SLE_MSG_QUEUE_MAX_SIZE;
        gateway_sle_msgqueue_read(rx_buf, &rx_length);
        if (strncmp((const char *)rx_buf, (const char *)sle_connect_state,
            sizeof(sle_connect_state)) == 0) {
            ret = sle_start_announce(SLE_ADV_HANDLE_DEFAULT);
            if (ret != ERRCODE_SLE_SUCCESS) {
                osal_printk("%s re-announce failed: %x\r\n", GATEWAY_LOG, ret);
            } else {
                osal_printk("%s re-announce started\r\n", GATEWAY_LOG);
            }
        }
        osal_msleep(GATEWAY_SLE_TASK_INTERVAL_MS);
    }

    gateway_sle_msgqueue_delete();
    return NULL;
}

/* ---------- UDP Bridge task ---------- */

static void *udp_bridge_task(const char *arg)
{
    unused(arg);
    int sock_fd = -1;

    /* Prefer router STA mode. Fall back to SoftAP for local recovery when credentials are not configured. */
    if (wifi_router_sta_init() != 0) {
        osal_printk("%s Wi-Fi STA init failed or not configured, fallback to SoftAP\r\n", GATEWAY_LOG);
        if (wifi_softap_init() != 0) {
            osal_printk("%s Wi-Fi SoftAP init failed\r\n", GATEWAY_LOG);
            return NULL;
        }
    }

    /* Start UDP bridge */
    if (udp_bridge_init(&sock_fd) != 0) {
        osal_printk("%s UDP bridge init failed\r\n", GATEWAY_LOG);
        return NULL;
    }
    osal_printk("%s UDP bridge ready on port %d\r\n", GATEWAY_LOG, UDP_BRIDGE_PORT);

    while (1) {
        udp_bridge_handle_packet(sock_fd);
    }

    return NULL;
}

/* ---------- Entry point ---------- */

static void gateway_entry(void)
{
    osal_task *task_handle = NULL;
    osal_kthread_lock();

    task_handle = osal_kthread_create((osal_kthread_handler)sle_server_task, 0,
        "GateSleTask", GATEWAY_SLE_STACK_SIZE);
    if (task_handle != NULL) {
        osal_kthread_set_priority(task_handle, GATEWAY_SLE_PRIO);
    }

    task_handle = osal_kthread_create((osal_kthread_handler)udp_bridge_task, 0,
        "GateUdpTask", GATEWAY_UDP_STACK_SIZE);
    if (task_handle != NULL) {
        osal_kthread_set_priority(task_handle, GATEWAY_UDP_PRIO);
    }

    osal_kthread_unlock();
}

app_run(gateway_entry);
