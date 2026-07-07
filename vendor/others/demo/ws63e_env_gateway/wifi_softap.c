/**
 * Copyright (c) HiSilicon (Shanghai) Technologies Co., Ltd. 2023-2023. All rights reserved.
 *
 * Description: Wi-Fi SoftAP setup for WS63E Environment Gateway.
 *              Adapted from wifi/softap_sample for osal_kthread context.
 * History:
 * 2026-07-06, Create file.
 */
#include "common_def.h"
#include "securec.h"
#include "soc_osal.h"
#include "lwip/netifapi.h"
#include "wifi_hotspot.h"
#include "wifi_hotspot_config.h"
#include "wifi_softap.h"

#define WIFI_AP_SSID        "WS63E_ENV_GATEWAY"
#define WIFI_AP_PASSWORD    "12345678"
#define WIFI_AP_CHANNEL     13
#define WIFI_AP_SECURITY    3   /* WPA_WPA2_PSK */

#define WIFI_AP_LOG         "[wifi_ap]"
#define WIFI_AP_WAIT_MS     100

int wifi_softap_init(void)
{
    ip4_addr_t ipaddr, netmask, gw;
    struct netif *netif_p = NULL;

    /* Wait for Wi-Fi subsystem */
    while (wifi_is_wifi_inited() == 0) {
        osal_msleep(WIFI_AP_WAIT_MS);
    }
    osal_printk("%s wifi subsystem ready\r\n", WIFI_AP_LOG);

    /* Advanced SoftAP config */
    osal_printk("%s step1: set advanced config\r\n", WIFI_AP_LOG);
    softap_config_advance_stru config = {0};
    config.beacon_interval = 100;
    config.dtim_period = 2;
    config.gi = 0;
    config.group_rekey = 86400;
    config.protocol_mode = 4;       /* 11b/g/n/ax */
    config.hidden_ssid_flag = 1;    /* 1 = broadcast SSID */
    if (wifi_set_softap_config_advance(&config) != 0) {
        osal_printk("%s set advanced config failed\r\n", WIFI_AP_LOG);
        return -1;
    }
    osal_printk("%s step2: enable softap\r\n", WIFI_AP_LOG);

    /* Basic SoftAP config */
    softap_config_stru hapd_conf = {0};
    if (memcpy_s(hapd_conf.ssid, sizeof(hapd_conf.ssid),
        WIFI_AP_SSID, sizeof(WIFI_AP_SSID)) != EOK) {
        osal_printk("%s ssid copy failed\r\n", WIFI_AP_LOG);
        return -1;
    }
    if (memcpy_s(hapd_conf.pre_shared_key, sizeof(hapd_conf.pre_shared_key),
        WIFI_AP_PASSWORD, sizeof(WIFI_AP_PASSWORD)) != EOK) {
        osal_printk("%s psk copy failed\r\n", WIFI_AP_LOG);
        return -1;
    }
    hapd_conf.security_type = WIFI_AP_SECURITY;
    hapd_conf.channel_num = WIFI_AP_CHANNEL;
    hapd_conf.wifi_psk_type = 0;

    if (wifi_softap_enable(&hapd_conf) != 0) {
        osal_printk("%s softap enable failed\r\n", WIFI_AP_LOG);
        return -1;
    }
    osal_printk("%s step3: find ap0\r\n", WIFI_AP_LOG);

    /* Configure IP */
    netif_p = netif_find("ap0");
    if (netif_p == NULL) {
        osal_printk("%s netif_find ap0 failed\r\n", WIFI_AP_LOG);
        wifi_softap_disable();
        return -1;
    }
    osal_printk("%s step4: set addr\r\n", WIFI_AP_LOG);

    IP4_ADDR(&ipaddr, 192, 168, 6, 1);
    IP4_ADDR(&netmask, 255, 255, 255, 0);
    IP4_ADDR(&gw, 192, 168, 6, 2);

    if (netifapi_netif_set_addr(netif_p, &ipaddr, &netmask, &gw) != 0) {
        osal_printk("%s set addr failed\r\n", WIFI_AP_LOG);
        wifi_softap_disable();
        return -1;
    }

    if (netifapi_dhcps_start(netif_p, NULL, 0) != 0) {
        osal_printk("%s dhcps start failed\r\n", WIFI_AP_LOG);
        wifi_softap_disable();
        return -1;
    }

    osal_printk("%s SoftAP started: SSID=%s IP=192.168.6.1\r\n",
        WIFI_AP_LOG, WIFI_AP_SSID);
    return 0;
}
