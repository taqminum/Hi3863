#ifndef WS63E_ENV_PATROL_CAR_BH1750_H
#define WS63E_ENV_PATROL_CAR_BH1750_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int bh1750_init(void);
int bh1750_read(uint32_t *light_lux_x10);

#ifdef __cplusplus
}
#endif

#endif
