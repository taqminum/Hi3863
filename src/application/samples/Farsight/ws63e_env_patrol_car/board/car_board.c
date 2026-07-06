#include "car_board.h"
#include "../drivers/i2c_bus.h"

#include "pinctrl.h"
#include "stdio.h"

typedef struct {
    uint8_t addr;
    const char *name;
    const char *note;
} car_i2c_probe_item_t;

static const car_i2c_probe_item_t g_probe_items[] = {
    {CAR_I2C_ADDR_BH1750, "BH1750 light", "7-bit schematic address"},
    {CAR_I2C_ADDR_AHT20, "AHT20 temp/humi", "7-bit schematic address"},
    {CAR_I2C_ADDR_SSD1306, "SSD1306 OLED", "7-bit driver address"},
    {CAR_I2C_ADDR_PCA9555, "PCA9555 IO", "she_docs/io_expander.h value; hardware ACK"},
    {CAR_I2C_ADDR_PCA9555_SCHEMATIC, "PCA9555 schematic probe", "schematic 7-bit value; hardware may NACK"},
    {CAR_I2C_ADDR_WHEEL_PWM, "wheel PWM bridge", "D:/fbb_ws63 exip06 motor address"},
    {CAR_I2C_ADDR_STM8S_MOTOR_LEGACY, "STM8S legacy probe", "schematic 7-bit value; hardware may NACK"},
    {CAR_I2C_ADDR_STM8S_MOTOR_COMPAT, "STM8S compat probe", "historical 8-bit value from schematic"},
    {CAR_I2C_ADDR_CW2015, "CW2015 battery", "optional 7-bit address"},
};

static int car_board_probe_core_devices(void)
{
    int core_ack = 0;
    if (car_i2c_probe(CAR_I2C_ADDR_BH1750) == 0) {
        core_ack++;
    }
    if (car_i2c_probe(CAR_I2C_ADDR_AHT20) == 0) {
        core_ack++;
    }
    if (car_i2c_probe(CAR_I2C_ADDR_SSD1306) == 0) {
        core_ack++;
    }
    return core_ack;
}

int car_board_init(void)
{
    printf("[car] board init: i2c bus=%d scl=gpio%d sda=gpio%d mode=%d baud=%d\r\n",
        CAR_I2C_BUS, CAR_I2C_SCL_PIN, CAR_I2C_SDA_PIN, CAR_I2C_PIN_MODE, CAR_I2C_BAUDRATE);

    uapi_pin_set_mode(CAR_I2C_SCL_PIN, CAR_I2C_PIN_MODE);
    uapi_pin_set_mode(CAR_I2C_SDA_PIN, CAR_I2C_PIN_MODE);

    int ret = car_i2c_init();
    if (ret != 0) {
        printf("[car] i2c init FAIL ret=0x%x\r\n", ret);
        return ret;
    }

    printf("[car] i2c init OK; APIs expect 7-bit device addresses\r\n");
    return 0;
}

int car_board_probe_i2c_devices(void)
{
    printf("[car] i2c probe begin\r\n");

    int core_ack = 0;
    for (uint32_t i = 0; i < (sizeof(g_probe_items) / sizeof(g_probe_items[0])); i++) {
        const car_i2c_probe_item_t *item = &g_probe_items[i];
        int ret = car_i2c_probe(item->addr);
        if (ret == 0 &&
            (item->addr == CAR_I2C_ADDR_BH1750 || item->addr == CAR_I2C_ADDR_AHT20 ||
                item->addr == CAR_I2C_ADDR_SSD1306)) {
            core_ack++;
        }
        printf("[car] probe 0x%02X %-18s %s ret=0x%x (%s)\r\n",
            item->addr,
            item->name,
            (ret == 0) ? "ACK " : "FAIL",
            ret,
            item->note);
    }

    if (core_ack == 0) {
        printf("[car] i2c core probe failed; reset controller and retry core devices\r\n");
        int reset_ret = car_i2c_reset();
        printf("[car] i2c reset ret=0x%x\r\n", reset_ret);
        core_ack = (reset_ret == 0) ? car_board_probe_core_devices() : 0;
        printf("[car] i2c core retry ack=%d/3\r\n", core_ack);
    }

    printf("[car] i2c probe end core_ack=%d/3\r\n", core_ack);
    return (core_ack >= 2) ? 0 : -1;
}
