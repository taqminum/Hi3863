#include "telemetry.h"

#include "sle_client.h"
#include "wifi_ap.h"

#include "stdio.h"

#define TELEMETRY_JSON_MIN_LEN 160U

int telemetry_init(void)
{
    printf("[car] telemetry serial JSON active; Wi-Fi/Web uplink uses the same payload contract\r\n");
    return 0;
}

int telemetry_format_json(const env_data_t *data, char *buf, size_t len)
{
    if (data == 0 || buf == 0 || len < TELEMETRY_JSON_MIN_LEN) {
        return -1;
    }

    int written = snprintf(buf, len,
        "{\"seq\":%u,\"temp_x10\":%d,\"humi_x10\":%u,\"light_x10\":%u,"
        "\"temp_alert\":%u,\"humi_alert\":%u,\"light_alert\":%u,"
        "\"motion\":%u,\"patrol\":%u,\"err\":%d}",
        data->sample_seq,
        data->temperature_c_x10,
        data->humidity_rh_x10,
        data->light_lux_x10,
        data->temp_alert,
        data->humi_alert,
        data->light_alert,
        data->motion,
        data->patrol_enabled,
        data->last_error);

    if (written < 0 || (size_t)written >= len) {
        return -1;
    }
    return written;
}

static int telemetry_publish_network(const char *json)
{
    (void)car_sle_client_send_text(json);
    return car_wifi_ap_publish_json(json);
}

int telemetry_publish(const env_data_t *data)
{
    char json[TELEMETRY_JSON_MIN_LEN];
    int ret = telemetry_format_json(data, json, sizeof(json));
    if (ret < 0) {
        printf("[car] telemetry format failed\r\n");
        return ret;
    }

    printf("[car] telemetry %s\r\n", json);
    (void)telemetry_publish_network(json);
    return 0;
}
