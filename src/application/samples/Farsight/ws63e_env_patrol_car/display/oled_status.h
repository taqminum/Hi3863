#ifndef WS63E_ENV_PATROL_CAR_OLED_STATUS_H
#define WS63E_ENV_PATROL_CAR_OLED_STATUS_H

#include "../model/env_data.h"

#ifdef __cplusplus
extern "C" {
#endif

int oled_status_init(void);
void oled_status_render(const env_data_t *data);

#ifdef __cplusplus
}
#endif

#endif
