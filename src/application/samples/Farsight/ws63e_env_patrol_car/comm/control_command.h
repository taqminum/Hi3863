#ifndef WS63E_ENV_PATROL_CAR_CONTROL_COMMAND_H
#define WS63E_ENV_PATROL_CAR_CONTROL_COMMAND_H

#include "../motor/car_motor.h"

#ifdef __cplusplus
extern "C" {
#endif

int control_command_parse(const char *payload, car_motor_cmd_t *cmd);
int control_command_apply(const char *payload);

#ifdef __cplusplus
}
#endif

#endif
