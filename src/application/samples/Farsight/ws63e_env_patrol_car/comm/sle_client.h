#ifndef WS63E_ENV_PATROL_CAR_SLE_CLIENT_H
#define WS63E_ENV_PATROL_CAR_SLE_CLIENT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CAR_SLE_STATE_IDLE = 0,
    CAR_SLE_STATE_STARTING,
    CAR_SLE_STATE_SCANNING,
    CAR_SLE_STATE_CONNECTED,
    CAR_SLE_STATE_ERROR,
} car_sle_state_t;

int car_sle_client_start(void);
car_sle_state_t car_sle_client_get_state(void);
int car_sle_client_send_text(const char *text);

#ifdef __cplusplus
}
#endif

#endif
