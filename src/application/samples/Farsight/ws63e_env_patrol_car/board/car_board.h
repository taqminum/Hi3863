#ifndef WS63E_ENV_PATROL_CAR_BOARD_H
#define WS63E_ENV_PATROL_CAR_BOARD_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CAR_I2C_BUS 1
#define CAR_I2C_SCL_PIN 15
#define CAR_I2C_SDA_PIN 16
#define CAR_I2C_PIN_MODE 2
#define CAR_I2C_BAUDRATE 100000
#define CAR_I2C_MASTER_CODE 0

/* Sensor/OLED addresses follow the proven WS63 driver values from she_docs and hardware logs. */
#define CAR_I2C_ADDR_PCA9555 0x28
#define CAR_I2C_ADDR_PCA9555_SCHEMATIC 0x14
#define CAR_I2C_ADDR_WHEEL_PWM 0x5A
#define CAR_I2C_ADDR_STM8S_MOTOR_LEGACY 0x15
#define CAR_I2C_ADDR_STM8S_MOTOR_COMPAT 0x2A
#define CAR_I2C_ADDR_BH1750 0x23
#define CAR_I2C_ADDR_AHT20 0x38
#define CAR_I2C_ADDR_SSD1306 0x3C
#define CAR_I2C_ADDR_CW2015 0x62

int car_board_init(void);
int car_board_probe_i2c_devices(void);

#ifdef __cplusplus
}
#endif

#endif
