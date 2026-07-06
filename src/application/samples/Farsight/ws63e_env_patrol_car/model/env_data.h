#ifndef WS63E_ENV_PATROL_CAR_ENV_DATA_H
#define WS63E_ENV_PATROL_CAR_ENV_DATA_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CAR_MOTION_STOP = 0,
    CAR_MOTION_FORWARD,
    CAR_MOTION_BACKWARD,
    CAR_MOTION_LEFT,
    CAR_MOTION_RIGHT,
} car_motion_t;

typedef struct {
    int32_t temperature_c_x10;
    uint32_t humidity_rh_x10;
    uint32_t light_lux_x10;
    uint8_t temp_alert;
    uint8_t humi_alert;
    uint8_t light_alert;
    car_motion_t motion;
    uint8_t patrol_enabled;
    uint32_t sample_seq;
    int last_error;
} env_data_t;

static inline void env_data_reset(env_data_t *data)
{
    if (data == 0) {
        return;
    }
    data->temperature_c_x10 = 0;
    data->humidity_rh_x10 = 0;
    data->light_lux_x10 = 0;
    data->temp_alert = 0;
    data->humi_alert = 0;
    data->light_alert = 0;
    data->motion = CAR_MOTION_STOP;
    data->patrol_enabled = 0;
    data->sample_seq = 0;
    data->last_error = 0;
}

#ifdef __cplusplus
}
#endif

#endif
