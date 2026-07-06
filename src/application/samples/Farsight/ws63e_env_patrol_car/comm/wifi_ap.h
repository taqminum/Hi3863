#ifndef WS63E_ENV_PATROL_CAR_WIFI_AP_H
#define WS63E_ENV_PATROL_CAR_WIFI_AP_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CAR_WIFI_STATE_IDLE = 0,
    CAR_WIFI_STATE_STARTING,
    CAR_WIFI_STATE_READY,
    CAR_WIFI_STATE_ERROR,
} car_wifi_state_t;

int car_wifi_ap_start(void);
car_wifi_state_t car_wifi_ap_get_state(void);
int car_wifi_ap_publish_json(const char *json);
const char *car_wifi_ap_get_last_json(void);

#ifdef __cplusplus
}
#endif

#endif
