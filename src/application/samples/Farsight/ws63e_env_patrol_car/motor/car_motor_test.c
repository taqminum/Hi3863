#include "car_motor.h"

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define WRITE_MAX 64

typedef struct {
    uint8_t reg;
    uint16_t duty;
} write_record_t;

static write_record_t g_writes[WRITE_MAX];
static unsigned int g_write_count;

void osDelay(uint32_t ticks)
{
    (void)ticks;
}

int car_i2c_write(uint8_t addr, const uint8_t *buf, uint32_t len)
{
    (void)addr;
    assert(len == 1 || len == 3);
    if (len == 3 && g_write_count < WRITE_MAX) {
        g_writes[g_write_count].reg = buf[0];
        g_writes[g_write_count].duty = (uint16_t)(((uint16_t)buf[1] << 8) | buf[2]);
        g_write_count++;
    }
    return 0;
}

static void clear_writes(void)
{
    memset(g_writes, 0, sizeof(g_writes));
    g_write_count = 0;
}

static uint16_t last_nonzero_duty(void)
{
    for (int i = (int)g_write_count - 1; i >= 0; i--) {
        if (g_writes[i].duty != 0) {
            return g_writes[i].duty;
        }
    }
    return 0;
}

static void command(car_motion_t motion, uint8_t speed)
{
    car_motor_cmd_t cmd = {
        .motion = motion,
        .speed_percent = speed,
        .duration_ms = 1000,
        .left_percent = 0,
        .right_percent = 0,
        .differential = 0,
    };
    assert(car_motor_command(&cmd) == 0);
}

int main(void)
{
    assert(car_motor_init() == 0);

    clear_writes();
    command(CAR_MOTION_FORWARD, 12);
    assert(last_nonzero_duty() == 280);

    clear_writes();
    command(CAR_MOTION_FORWARD, 90);
    assert(last_nonzero_duty() == 1000);

    clear_writes();
    command(CAR_MOTION_LEFT, 40);
    assert(last_nonzero_duty() == 280);

    clear_writes();
    command(CAR_MOTION_LEFT, 90);
    assert(last_nonzero_duty() == 1000);

    puts("car_motor_test passed");
    return 0;
}
