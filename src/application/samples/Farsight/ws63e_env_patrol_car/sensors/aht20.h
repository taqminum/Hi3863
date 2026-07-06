#ifndef WS63E_ENV_PATROL_CAR_AHT20_H
#define WS63E_ENV_PATROL_CAR_AHT20_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int aht20_init(void);
int aht20_read(int32_t *temperature_c_x10, uint32_t *humidity_rh_x10);

#ifdef __cplusplus
}
#endif

#endif
