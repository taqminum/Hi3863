#ifndef WS63E_ENV_PATROL_CAR_PATROL_ROUTE_H
#define WS63E_ENV_PATROL_CAR_PATROL_ROUTE_H

#include "../model/env_data.h"

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void patrol_route_init(void);
void patrol_route_start(void);
void patrol_route_start_return_lane(void);
void patrol_route_stop(void);
void patrol_route_tick(uint32_t elapsed_ms, env_data_t *data);

#ifdef __cplusplus
}
#endif

#endif
