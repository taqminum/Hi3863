#include "i2c_bus.h"
#include "../board/car_board.h"

#include "i2c.h"
#include "stdio.h"

int car_i2c_init(void)
{
    return (int)uapi_i2c_master_init(CAR_I2C_BUS, CAR_I2C_BAUDRATE, CAR_I2C_MASTER_CODE);
}

int car_i2c_reset(void)
{
    (void)uapi_i2c_deinit(CAR_I2C_BUS);
    return car_i2c_init();
}

int car_i2c_write(uint8_t addr, const uint8_t *buf, uint32_t len)
{
    if (buf == NULL || len == 0) {
        return -1;
    }

    i2c_data_t data = {0};
    data.send_buf = (uint8_t *)buf;
    data.send_len = len;

    return (int)uapi_i2c_master_write(CAR_I2C_BUS, addr, &data);
}

int car_i2c_read(uint8_t addr, uint8_t *buf, uint32_t len)
{
    if (buf == NULL || len == 0) {
        return -1;
    }

    i2c_data_t data = {0};
    data.receive_buf = buf;
    data.receive_len = len;

    return (int)uapi_i2c_master_read(CAR_I2C_BUS, addr, &data);
}

int car_i2c_probe(uint8_t addr)
{
    uint8_t scratch = 0;
    return car_i2c_read(addr, &scratch, sizeof(scratch));
}
