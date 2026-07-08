#include "patrol_route.h"

#include "../motor/car_motor.h"

#include <assert.h>
#include <stdio.h>

#define RECORDED_MAX 8

static car_motor_cmd_t g_recorded[RECORDED_MAX];
static unsigned int g_recorded_count;
static unsigned int g_stop_count;

int car_motor_command(const car_motor_cmd_t *cmd)
{
    assert(cmd != 0);
    assert(g_recorded_count < RECORDED_MAX);
    g_recorded[g_recorded_count++] = *cmd;
    return 0;
}

int car_motor_stop(void)
{
    g_stop_count++;
    return 0;
}

static void tick_with_data(uint32_t elapsed_ms)
{
    env_data_t data;
    env_data_reset(&data);
    patrol_route_tick(elapsed_ms, &data);
}

static void assert_step(unsigned int index, car_motion_t motion, uint8_t speed, uint16_t duration_ms)
{
    assert(index < g_recorded_count);
    assert(g_recorded[index].motion == motion);
    assert(g_recorded[index].speed_percent == speed);
    assert(g_recorded[index].duration_ms == duration_ms);
}

int main(void)
{
    env_data_t data;

    patrol_route_init();
    patrol_route_start();

    env_data_reset(&data);
    patrol_route_tick(1000, &data);
    assert(data.patrol_enabled == 1);
    assert(data.motion == CAR_MOTION_FORWARD);
    assert_step(0, CAR_MOTION_FORWARD, 45, 2000);

    tick_with_data(1000);
    tick_with_data(600);
    assert_step(1, CAR_MOTION_LEFT, 35, 600);

    tick_with_data(2000);
    assert_step(2, CAR_MOTION_FORWARD, 45, 2000);

    tick_with_data(600);
    assert_step(3, CAR_MOTION_RIGHT, 35, 600);

    tick_with_data(2000);
    assert_step(4, CAR_MOTION_FORWARD, 45, 2000);

    tick_with_data(500);
    assert_step(5, CAR_MOTION_STOP, 0, 500);

    tick_with_data(500);
    env_data_reset(&data);
    patrol_route_tick(1000, &data);
    assert(data.patrol_enabled == 0);
    assert(data.motion == CAR_MOTION_STOP);
    assert(g_recorded_count == 6);
    assert(g_stop_count >= 1);

    puts("patrol_route_test passed");
    return 0;
}
