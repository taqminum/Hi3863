#include "aht20.h"

#include "../board/car_board.h"
#include "../drivers/i2c_bus.h"

#include "cmsis_os2.h"
#include "stdio.h"

#define AHT20_STATUS_BUSY 0x80
#define AHT20_STATUS_CALIBRATED 0x08
#define AHT20_RAW_FULL_SCALE 1048576ULL

int aht20_init(void)
{
    uint8_t cmd[] = {0xBE, 0x08, 0x00};
    int ret = car_i2c_write(CAR_I2C_ADDR_AHT20, cmd, sizeof(cmd));
    osDelay(2);
    printf("[car] AHT20 init ret=0x%x\r\n", ret);
    return ret;
}

int aht20_read(int32_t *temperature_c_x10, uint32_t *humidity_rh_x10)
{
    if (temperature_c_x10 == 0 || humidity_rh_x10 == 0) {
        return -1;
    }

    uint8_t trigger[] = {0xAC, 0x33, 0x00};
    int ret = car_i2c_write(CAR_I2C_ADDR_AHT20, trigger, sizeof(trigger));
    if (ret != 0) {
        return ret;
    }

    osDelay(8);

    uint8_t raw[6] = {0};
    ret = car_i2c_read(CAR_I2C_ADDR_AHT20, raw, sizeof(raw));
    if (ret != 0) {
        return ret;
    }
    if ((raw[0] & AHT20_STATUS_BUSY) != 0) {
        return -2;
    }
    if ((raw[0] & AHT20_STATUS_CALIBRATED) == 0) {
        return -3;
    }

    uint32_t raw_humi = ((uint32_t)raw[1] << 12) | ((uint32_t)raw[2] << 4) | ((uint32_t)raw[3] >> 4);
    uint32_t raw_temp = (((uint32_t)raw[3] & 0x0F) << 16) | ((uint32_t)raw[4] << 8) | raw[5];

    *humidity_rh_x10 = (uint32_t)(((uint64_t)raw_humi * 1000ULL) / AHT20_RAW_FULL_SCALE);
    *temperature_c_x10 = (int32_t)(((uint64_t)raw_temp * 2000ULL) / AHT20_RAW_FULL_SCALE) - 500;
    return 0;
}
