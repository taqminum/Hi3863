/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: UDP bridge header for WS63E Environment Gateway.
 * History:
 * 2026-07-06, Create file.
 */

#ifndef UDP_BRIDGE_H
#define UDP_BRIDGE_H

#define UDP_BRIDGE_PORT  8888

int  udp_bridge_init(int *out_sock_fd);
void udp_bridge_handle_packet(int sock_fd);

#endif
