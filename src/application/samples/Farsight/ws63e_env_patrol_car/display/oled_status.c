#include "oled_status.h"

#include "../comm/wifi_ap.h"
#include "../../../../../../she_docs/ssd1306.h"

#include "stdio.h"

static int decimal_abs(int value)
{
    return (value < 0) ? -value : value;
}

static int env_data_has_valid_sample(const env_data_t *data)
{
    return (data != 0) && (data->sample_seq > 0U) && (data->last_error == 0);
}

static int env_data_has_alert(const env_data_t *data)
{
    return (data != 0) && (data->temp_alert != 0U || data->humi_alert != 0U || data->light_alert != 0U);
}

static const char *motion_name(car_motion_t motion)
{
    switch (motion) {
        case CAR_MOTION_FORWARD:
            return "FWD";
        case CAR_MOTION_BACKWARD:
            return "BACK";
        case CAR_MOTION_LEFT:
            return "LEFT";
        case CAR_MOTION_RIGHT:
            return "RIGHT";
        case CAR_MOTION_STOP:
        default:
            return "STOP";
    }
}

static const char *wifi_state_name(car_wifi_state_t state)
{
    switch (state) {
        case CAR_WIFI_STATE_STARTING:
            return "W:BOOT";
        case CAR_WIFI_STATE_READY:
            return "W:AP";
        case CAR_WIFI_STATE_ERROR:
            return "W:ERR";
        case CAR_WIFI_STATE_IDLE:
        default:
            return "W:IDLE";
    }
}

int oled_status_init(void)
{
    printf("[car] OLED init via she_docs SSD1306 driver\r\n");
    ssd1306_Init();
    ssd1306_ClearOLED();
    ssd1306_printf("WS63E Patrol");
    return 0;
}

void oled_status_render(const env_data_t *data)
{
    if (data == 0) {
        return;
    }

    char line0[18];
    char line1[18];
    char line2[18];
    char line3[18];

    (void)snprintf(line0, sizeof(line0), "%s", env_data_has_alert(data) ? "WS63E ALERT" : "WS63E Patrol");
    if (env_data_has_valid_sample(data)) {
        int temp_frac = decimal_abs(data->temperature_c_x10 % 10);
        int humi_frac = (int)(data->humidity_rh_x10 % 10U);
        int light_frac = (int)(data->light_lux_x10 % 10U);
        (void)snprintf(line1, sizeof(line1), "T:%d.%d H:%u.%d", data->temperature_c_x10 / 10,
            temp_frac, data->humidity_rh_x10 / 10U, humi_frac);
        (void)snprintf(line2, sizeof(line2), "L:%u.%d lx", data->light_lux_x10 / 10U, light_frac);
    } else {
        (void)snprintf(line1, sizeof(line1), "T:--.- H:--.-");
        (void)snprintf(line2, sizeof(line2), "L:----.- lx");
    }

    if (data->last_error != 0) {
        (void)snprintf(line3, sizeof(line3), "E:%X %s", (unsigned int)data->last_error,
            wifi_state_name(car_wifi_ap_get_state()));
    } else if (env_data_has_alert(data)) {
        (void)snprintf(line3, sizeof(line3), "ALERT %s", wifi_state_name(car_wifi_ap_get_state()));
    } else {
        (void)snprintf(line3, sizeof(line3), "%s %s", motion_name(data->motion),
            wifi_state_name(car_wifi_ap_get_state()));
    }

    ssd1306_ClearOLED();
    ssd1306_printf("%s", line0);
    ssd1306_printf("%s", line1);
    ssd1306_printf("%s", line2);
    ssd1306_printf("%s", line3);
}
