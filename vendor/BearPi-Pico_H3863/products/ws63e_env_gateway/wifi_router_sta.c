/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: Wi-Fi STA setup for WS63E Environment Gateway router mode.
 *              The gateway joins the same router as the phone while UDP/SLE logic stays unchanged.
 * History:
 * 2026-07-08, Create file.
 */
#include "common_def.h"
#include "securec.h"
#include "soc_osal.h"
#include "lwip/netifapi.h"
#include "wifi_hotspot.h"
#include "wifi_hotspot_config.h"
#include "wifi_router_sta.h"
#include "string.h"

#define WIFI_ROUTER_SSID_PLACEHOLDER      "TO_BE_SET_ROUTER_SSID"
#define WIFI_ROUTER_PASSWORD_PLACEHOLDER  "TO_BE_SET_ROUTER_PASSWORD"
#ifndef CONFIG_WS63E_ENV_GATEWAY_ROUTER_SSID
#define CONFIG_WS63E_ENV_GATEWAY_ROUTER_SSID WIFI_ROUTER_SSID_PLACEHOLDER
#endif
#ifndef CONFIG_WS63E_ENV_GATEWAY_ROUTER_PASSWORD
#define CONFIG_WS63E_ENV_GATEWAY_ROUTER_PASSWORD WIFI_ROUTER_PASSWORD_PLACEHOLDER
#endif
#define WIFI_ROUTER_SSID                  CONFIG_WS63E_ENV_GATEWAY_ROUTER_SSID
#define WIFI_ROUTER_PASSWORD              CONFIG_WS63E_ENV_GATEWAY_ROUTER_PASSWORD

#define WIFI_STA_LOG                      "[wifi_sta]"
#define WIFI_IFNAME_MAX_SIZE              16
#define WIFI_MAX_SSID_LEN                 33
#define WIFI_SCAN_AP_LIMIT                64
#define WIFI_MAC_LEN                      6
#define WIFI_GET_IP_MAX_COUNT             300
#define WIFI_STA_WAIT_MS                  100
#define WIFI_STA_INIT_MAX_TICKS           4500

enum {
    WIFI_STA_STATE_INIT = 0,
    WIFI_STA_STATE_SCANING,
    WIFI_STA_STATE_SCAN_DONE,
    WIFI_STA_STATE_FOUND_TARGET,
    WIFI_STA_STATE_CONNECTING,
    WIFI_STA_STATE_CONNECT_DONE,
    WIFI_STA_STATE_GET_IP,
};

static uint8_t g_wifi_state = WIFI_STA_STATE_INIT;

static void wifi_router_scan_state_changed(int32_t state, int32_t size)
{
    unused(state);
    unused(size);
    osal_printk("%s scan done\r\n", WIFI_STA_LOG);
    g_wifi_state = WIFI_STA_STATE_SCAN_DONE;
}

static void wifi_router_connection_changed(int32_t state, const wifi_linked_info_stru *info, int32_t reason_code)
{
    unused(info);
    unused(reason_code);
    if (state == 0) {
        osal_printk("%s connect failed, retry\r\n", WIFI_STA_LOG);
        g_wifi_state = WIFI_STA_STATE_INIT;
    } else {
        osal_printk("%s connect success\r\n", WIFI_STA_LOG);
        g_wifi_state = WIFI_STA_STATE_CONNECT_DONE;
    }
}

static wifi_event_stru g_wifi_event_cb = {
    .wifi_event_connection_changed = wifi_router_connection_changed,
    .wifi_event_scan_state_changed = wifi_router_scan_state_changed,
};

int wifi_router_sta_is_configured(void)
{
    return strcmp(WIFI_ROUTER_SSID, WIFI_ROUTER_SSID_PLACEHOLDER) != 0 &&
        strcmp(WIFI_ROUTER_PASSWORD, WIFI_ROUTER_PASSWORD_PLACEHOLDER) != 0;
}

static int wifi_router_find_network(wifi_sta_config_stru *expected_bss)
{
    uint32_t num = WIFI_SCAN_AP_LIMIT;
    uint32_t scan_len = sizeof(wifi_scan_info_stru) * WIFI_SCAN_AP_LIMIT;
    wifi_scan_info_stru *result = osal_kmalloc(scan_len, OSAL_GFP_ATOMIC);
    if (result == NULL) {
        return -1;
    }
    (void)memset_s(result, scan_len, 0, scan_len);

    if (wifi_sta_get_scan_info(result, &num) != 0) {
        osal_kfree(result);
        return -1;
    }

    for (uint8_t i = 0; i < num; i++) {
        if (strlen(WIFI_ROUTER_SSID) != strlen(result[i].ssid) ||
            memcmp(WIFI_ROUTER_SSID, result[i].ssid, strlen(WIFI_ROUTER_SSID)) != 0) {
            continue;
        }

        if (memcpy_s(expected_bss->ssid, WIFI_MAX_SSID_LEN, WIFI_ROUTER_SSID, strlen(WIFI_ROUTER_SSID)) != EOK ||
            memcpy_s(expected_bss->bssid, WIFI_MAC_LEN, result[i].bssid, WIFI_MAC_LEN) != EOK ||
            memcpy_s(expected_bss->pre_shared_key, WIFI_MAX_SSID_LEN,
                WIFI_ROUTER_PASSWORD, strlen(WIFI_ROUTER_PASSWORD)) != EOK) {
            osal_kfree(result);
            return -1;
        }
        expected_bss->security_type = result[i].security_type;
        expected_bss->ip_type = 1;
        osal_kfree(result);
        return 0;
    }

    osal_kfree(result);
    return -1;
}

static int wifi_router_check_dhcp(struct netif *netif_p, uint32_t *wait_count)
{
    if (netif_p != NULL && ip_addr_isany(&(netif_p->ip_addr)) == 0 &&
        *wait_count <= WIFI_GET_IP_MAX_COUNT) {
        osal_printk("%s DHCP success ip=%s\r\n", WIFI_STA_LOG, ipaddr_ntoa(&(netif_p->ip_addr)));
        return 0;
    }

    if (*wait_count > WIFI_GET_IP_MAX_COUNT) {
        osal_printk("%s DHCP timeout, retry\r\n", WIFI_STA_LOG);
        *wait_count = 0;
        g_wifi_state = WIFI_STA_STATE_INIT;
    }
    return -1;
}

int wifi_router_sta_init(void)
{
    char ifname[WIFI_IFNAME_MAX_SIZE + 1] = "wlan0";
    wifi_sta_config_stru expected_bss = {0};
    struct netif *netif_p = NULL;
    uint32_t wait_count = 0;
    uint32_t init_ticks = 0;

    if (!wifi_router_sta_is_configured()) {
        osal_printk("%s router credentials not configured\r\n", WIFI_STA_LOG);
        return -1;
    }

    if (wifi_register_event_cb(&g_wifi_event_cb) != 0) {
        osal_printk("%s event cb register failed\r\n", WIFI_STA_LOG);
        return -1;
    }

    while (wifi_is_wifi_inited() == 0) {
        osal_msleep(WIFI_STA_WAIT_MS);
    }

    if (wifi_sta_enable() != 0) {
        osal_printk("%s STA enable failed\r\n", WIFI_STA_LOG);
        return -1;
    }
    g_wifi_state = WIFI_STA_STATE_INIT;
    osal_printk("%s STA enable OK, target SSID=%s\r\n", WIFI_STA_LOG, WIFI_ROUTER_SSID);

    while (init_ticks < WIFI_STA_INIT_MAX_TICKS) {
        osal_msleep(10);
        init_ticks++;
        if (g_wifi_state == WIFI_STA_STATE_INIT) {
            osal_printk("%s scan start\r\n", WIFI_STA_LOG);
            g_wifi_state = WIFI_STA_STATE_SCANING;
            if (wifi_sta_scan() != 0) {
                g_wifi_state = WIFI_STA_STATE_INIT;
            }
        } else if (g_wifi_state == WIFI_STA_STATE_SCAN_DONE) {
            if (wifi_router_find_network(&expected_bss) != 0) {
                osal_printk("%s target AP not found, retry\r\n", WIFI_STA_LOG);
                g_wifi_state = WIFI_STA_STATE_INIT;
                continue;
            }
            g_wifi_state = WIFI_STA_STATE_FOUND_TARGET;
        } else if (g_wifi_state == WIFI_STA_STATE_FOUND_TARGET) {
            osal_printk("%s connect start\r\n", WIFI_STA_LOG);
            g_wifi_state = WIFI_STA_STATE_CONNECTING;
            if (wifi_sta_connect(&expected_bss) != 0) {
                g_wifi_state = WIFI_STA_STATE_INIT;
            }
        } else if (g_wifi_state == WIFI_STA_STATE_CONNECT_DONE) {
            osal_printk("%s DHCP start\r\n", WIFI_STA_LOG);
            g_wifi_state = WIFI_STA_STATE_GET_IP;
            netif_p = netifapi_netif_find(ifname);
            if (netif_p == NULL || netifapi_dhcp_start(netif_p) != 0) {
                osal_printk("%s find netif or DHCP start failed\r\n", WIFI_STA_LOG);
                g_wifi_state = WIFI_STA_STATE_INIT;
            }
        } else if (g_wifi_state == WIFI_STA_STATE_GET_IP) {
            if (wifi_router_check_dhcp(netif_p, &wait_count) == 0) {
                return 0;
            }
            wait_count++;
        }
    }

    osal_printk("%s init timeout, fallback to SoftAP\r\n", WIFI_STA_LOG);
    (void)wifi_sta_disable();
    g_wifi_state = WIFI_STA_STATE_INIT;
    return -1;
}
