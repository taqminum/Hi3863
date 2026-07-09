#include "patrol_route.h"

#include "../motor/car_motor.h"

#include <assert.h>
#include <stdio.h>

#define RECORDED_MAX 12

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

static void reset_recording(void)
{
    g_recorded_count = 0;
    g_stop_count = 0;
}

static void assert_route_finished(unsigned int expected_steps)
{
    env_data_t data;
    env_data_reset(&data);
    patrol_route_tick(1000, &data);
    assert(data.patrol_enabled == 0);
    assert(data.motion == CAR_MOTION_STOP);
    assert(g_recorded_count == expected_steps);
    assert(g_stop_count >= 1);
}

static void test_closed_loop_route(void)
{
    env_data_t data;

    reset_recording();
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
    assert_step(3, CAR_MOTION_LEFT, 35, 600);

    tick_with_data(2000);
    assert_step(4, CAR_MOTION_FORWARD, 45, 2000);

    tick_with_data(600);
    assert_step(5, CAR_MOTION_LEFT, 35, 600);

    tick_with_data(2000);
    assert_step(6, CAR_MOTION_FORWARD, 45, 2000);

    tick_with_data(600);
    assert_step(7, CAR_MOTION_LEFT, 35, 600);

    tick_with_data(500);
    assert_step(8, CAR_MOTION_STOP, 0, 500);

    tick_with_data(500);
    assert_route_finished(9);
}

static void test_return_lane_route(void)
{
    reset_recording();
    patrol_route_init();
    patrol_route_start_return_lane();

    tick_with_data(1000);
    assert_step(0, CAR_MOTION_FORWARD, 42, 2200);

    tick_with_data(1200);
    tick_with_data(500);
    assert_step(1, CAR_MOTION_STOP, 0, 500);

    tick_with_data(520);
    assert_step(2, CAR_MOTION_RIGHT, 32, 520);

    tick_with_data(1600);
    assert_step(3, CAR_MOTION_FORWARD, 38, 1600);

    tick_with_data(520);
    assert_step(4, CAR_MOTION_LEFT, 32, 520);

    tick_with_data(2200);
    assert_step(5, CAR_MOTION_BACKWARD, 35, 2200);

    tick_with_data(500);
    assert_step(6, CAR_MOTION_STOP, 0, 500);

    tick_with_data(500);
    assert_route_finished(7);
}

int main(void)
{
    test_closed_loop_route();
    test_return_lane_route();

    puts("patrol_route_test passed");
    return 0;
}
