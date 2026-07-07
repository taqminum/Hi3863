/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: Thread-safe telemetry JSON cache for WS63E Environment Gateway.
 *              Single writer (SLE callback), single reader (UDP task).
 * History:
 * 2026-07-06, Create file.
 */
#include "telemetry_cache.h"
#include "securec.h"

#define TELEMETRY_CACHE_SIZE  512

static char     g_cache[TELEMETRY_CACHE_SIZE];
static uint16_t g_cache_len;
static bool     g_cache_ready;

void telemetry_cache_init(void)
{
    (void)memset_s(g_cache, sizeof(g_cache), 0, sizeof(g_cache));
    g_cache_len = 0;
    g_cache_ready = false;
}

void telemetry_cache_update(const uint8_t *data, uint16_t len)
{
    if (data == NULL || len == 0 || len >= TELEMETRY_CACHE_SIZE) {
        return;
    }
    (void)memset_s(g_cache, sizeof(g_cache), 0, sizeof(g_cache));
    (void)memcpy_s(g_cache, sizeof(g_cache), data, len);
    g_cache_len = len;
    g_cache_ready = true;
}

int telemetry_cache_get(char *buf, uint16_t buf_size)
{
    if (!g_cache_ready || buf == NULL || buf_size <= g_cache_len) {
        return -1;
    }
    (void)memcpy_s(buf, buf_size, g_cache, g_cache_len);
    buf[g_cache_len] = '\0';
    return (int)g_cache_len;
}

bool telemetry_cache_is_ready(void)
{
    return g_cache_ready;
}
