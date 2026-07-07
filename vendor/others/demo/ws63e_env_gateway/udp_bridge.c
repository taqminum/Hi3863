/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: UDP bridge for WS63E Environment Gateway.
 *              Receives commands from phone App, forwards to car over SLE,
 *              responds with latest cached telemetry JSON.
 * History:
 * 2026-07-06, Create file.
 */
#include "common_def.h"
#include "soc_osal.h"
#include "lwip/sockets.h"
#include "lwip/netif.h"
#include "lwip/nettool/misc.h"
#include "sle_uart_server.h"
#include "telemetry_cache.h"
#include "udp_bridge.h"

#define UDP_RECV_BUF_SIZE   256
#define UDP_TELEM_BUF_SIZE  512
#define UDP_BRIDGE_LOG      "[udp_bridge]"

int udp_bridge_init(int *out_sock_fd)
{
    int sock_fd;
    struct sockaddr_in local_addr = {0};

    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        osal_printk("%s socket create failed\r\n", UDP_BRIDGE_LOG);
        return -1;
    }

    local_addr.sin_family = AF_INET;
    local_addr.sin_port = htons(UDP_BRIDGE_PORT);
    local_addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(sock_fd, (struct sockaddr *)&local_addr, sizeof(local_addr)) < 0) {
        osal_printk("%s bind port %d failed\r\n", UDP_BRIDGE_LOG, UDP_BRIDGE_PORT);
        lwip_close(sock_fd);
        return -1;
    }

    *out_sock_fd = sock_fd;
    osal_printk("%s listening on port %d\r\n", UDP_BRIDGE_LOG, UDP_BRIDGE_PORT);
    return 0;
}

void udp_bridge_handle_packet(int sock_fd)
{
    char recv_buf[UDP_RECV_BUF_SIZE];
    char telemetry[UDP_TELEM_BUF_SIZE];
    struct sockaddr_in src_addr = {0};
    socklen_t src_len = sizeof(src_addr);
    int n;

    (void)memset_s(recv_buf, sizeof(recv_buf), 0, sizeof(recv_buf));

    n = recvfrom(sock_fd, recv_buf, sizeof(recv_buf) - 1, 0,
                 (struct sockaddr *)&src_addr, &src_len);
    if (n <= 0) {
        return;
    }
    recv_buf[n] = '\0';

    osal_printk("%s rx from %s:%d => %s\r\n", UDP_BRIDGE_LOG,
        inet_ntoa(src_addr.sin_addr), ntohs(src_addr.sin_port), recv_buf);

    /* Forward command to car over SLE */
    if (sle_uart_client_is_connected() != 0) {
        uint16_t conn_id = get_connect_id();
        osal_printk("%s SLE conn_hdl=%u pair_hdl=%u, forwarding %d bytes\r\n",
            UDP_BRIDGE_LOG, conn_id, sle_uart_client_is_connected(), n);
        errcode_t ret = sle_uart_server_send_report_by_uuid(
            (const uint8_t *)recv_buf, (uint8_t)n);
        osal_printk("%s forwarded to SLE: ret=%d\r\n", UDP_BRIDGE_LOG, ret);
    } else {
        osal_printk("%s SLE not connected, cannot forward\r\n", UDP_BRIDGE_LOG);
    }

    /* Respond with latest cached telemetry */
    (void)memset_s(telemetry, sizeof(telemetry), 0, sizeof(telemetry));
    if (telemetry_cache_get(telemetry, sizeof(telemetry)) > 0) {
        sendto(sock_fd, telemetry, strlen(telemetry), 0,
               (struct sockaddr *)&src_addr, src_len);
        osal_printk("%s tx telemetry: %s\r\n", UDP_BRIDGE_LOG, telemetry);
    }
}
