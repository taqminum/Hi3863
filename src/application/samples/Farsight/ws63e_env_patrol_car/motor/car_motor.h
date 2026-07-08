#ifndef WS63E_ENV_PATROL_CAR_MOTOR_H
#define WS63E_ENV_PATROL_CAR_MOTOR_H

#include "../model/env_data.h"

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    car_motion_t motion;
    uint8_t speed_percent;
    uint16_t duration_ms;
    int8_t left_percent;
    int8_t right_percent;
    uint8_t differential;
} car_motor_cmd_t;

int car_motor_init(void);
int car_motor_command(const car_motor_cmd_t *cmd);
int car_motor_drive(int8_t left_percent, int8_t right_percent, uint16_t duration_ms);
int car_motor_manual_command(const car_motor_cmd_t *cmd);
int car_motor_stop(void);
int car_motor_exip06_diag_forward(void);
void car_motor_tick(uint32_t elapsed_ms);
car_motion_t car_motor_get_motion(void);

#ifdef __cplusplus
}
#endif

#endif
