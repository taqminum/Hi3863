#include "bh1750.h"

#include "../board/car_board.h"
#include "../drivers/i2c_bus.h"

#include "cmsis_os2.h"
#include "stdio.h"

#define BH1750_POWER_ON 0x01
#define BH1750_CONT_H_RES_MODE 0x10

static int bh1750_write_cmd(uint8_t cmd)
{
    return car_i2c_write(CAR_I2C_ADDR_BH1750, &cmd, sizeof(cmd));
}

int bh1750_init(void)
{
    int ret = bh1750_write_cmd(BH1750_POWER_ON);
    if (ret != 0) {
        printf("[car] BH1750 power on ret=0x%x\r\n", ret);
        return ret;
    }
    osDelay(2);
    ret = bh1750_write_cmd(BH1750_CONT_H_RES_MODE);
    printf("[car] BH1750 init ret=0x%x\r\n", ret);
    return ret;
}

int bh1750_read(uint32_t *light_lux_x10)
{
    if (light_lux_x10 == 0) {
        return -1;
    }

    uint8_t raw[2] = {0};
    int ret = car_i2c_read(CAR_I2C_ADDR_BH1750, raw, sizeof(raw));
    if (ret != 0) {
        return ret;
    }

    uint32_t value = ((uint32_t)raw[0] << 8) | raw[1];
    *light_lux_x10 = (value * 100U) / 12U;
    return 0;
}
