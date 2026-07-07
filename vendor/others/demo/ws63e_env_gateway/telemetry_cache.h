/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: Telemetry cache header for WS63E Environment Gateway.
 * History:
 * 2026-07-06, Create file.
 */

#ifndef TELEMETRY_CACHE_H
#define TELEMETRY_CACHE_H

#include <stdint.h>
#include <stdbool.h>

void telemetry_cache_init(void);
void telemetry_cache_update(const uint8_t *data, uint16_t len);
int  telemetry_cache_get(char *buf, uint16_t buf_size);
bool telemetry_cache_is_ready(void);

#endif
