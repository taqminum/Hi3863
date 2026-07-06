#ifndef WS63E_ENV_PATROL_CAR_I2C_BUS_H
#define WS63E_ENV_PATROL_CAR_I2C_BUS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int car_i2c_init(void);
int car_i2c_reset(void);
int car_i2c_write(uint8_t addr, const uint8_t *buf, uint32_t len);
int car_i2c_read(uint8_t addr, uint8_t *buf, uint32_t len);
int car_i2c_probe(uint8_t addr);

#ifdef __cplusplus
}
#endif

#endif
