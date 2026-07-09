#include "patrol_route.h"

#include "../motor/car_motor.h"

#include "stdio.h"

typedef struct {
    car_motion_t motion;
    uint8_t speed_percent;
    uint16_t duration_ms;
} patrol_step_t;

static const patrol_step_t g_route[] = {
    {CAR_MOTION_FORWARD, 45, 2000},
    {CAR_MOTION_LEFT, 35, 600},
    {CAR_MOTION_FORWARD, 45, 2000},
    {CAR_MOTION_LEFT, 35, 600},
    {CAR_MOTION_FORWARD, 45, 2000},
    {CAR_MOTION_LEFT, 35, 600},
    {CAR_MOTION_FORWARD, 45, 2000},
    {CAR_MOTION_LEFT, 35, 600},
    {CAR_MOTION_STOP, 0, 500},
};

static const patrol_step_t g_return_lane_route[] = {
    {CAR_MOTION_FORWARD, 42, 2200},
    {CAR_MOTION_STOP, 0, 500},
    {CAR_MOTION_RIGHT, 32, 520},
    {CAR_MOTION_FORWARD, 38, 1600},
    {CAR_MOTION_LEFT, 32, 520},
    {CAR_MOTION_BACKWARD, 35, 2200},
    {CAR_MOTION_STOP, 0, 500},
};

static uint8_t g_enabled;
static uint32_t g_step_index;
static uint32_t g_step_elapsed;
static const patrol_step_t *g_active_route = g_route;
static uint32_t g_active_route_len = sizeof(g_route) / sizeof(g_route[0]);

void patrol_route_init(void)
{
    g_enabled = 0;
    g_step_index = 0;
    g_step_elapsed = 0;
    g_active_route = g_route;
    g_active_route_len = sizeof(g_route) / sizeof(g_route[0]);
}

void patrol_route_start(void)
{
    g_enabled = 1;
    g_step_index = 0;
    g_step_elapsed = 0;
    g_active_route = g_route;
    g_active_route_len = sizeof(g_route) / sizeof(g_route[0]);
    printf("[car] closed-loop route start\r\n");
}

void patrol_route_start_return_lane(void)
{
    g_enabled = 1;
    g_step_index = 0;
    g_step_elapsed = 0;
    g_active_route = g_return_lane_route;
    g_active_route_len = sizeof(g_return_lane_route) / sizeof(g_return_lane_route[0]);
    printf("[car] return-lane route start\r\n");
}

void patrol_route_stop(void)
{
    uint8_t was_enabled = g_enabled;
    g_enabled = 0;
    g_step_index = 0;
    g_step_elapsed = 0;
    if (was_enabled != 0) {
        (void)car_motor_stop();
    }
    printf("[car] precheck route stop\r\n");
}

void patrol_route_tick(uint32_t elapsed_ms, env_data_t *data)
{
    if (data == 0) {
        return;
    }

    data->patrol_enabled = g_enabled;
    if (g_enabled == 0) {
        data->motion = CAR_MOTION_STOP;
        return;
    }

    const patrol_step_t *step = &g_active_route[g_step_index];
    data->motion = step->motion;

    if (g_step_elapsed == 0) {
        car_motor_cmd_t cmd = {
            .motion = step->motion,
            .speed_percent = step->speed_percent,
            .duration_ms = step->duration_ms,
        };
        (void)car_motor_command(&cmd);
    }

    g_step_elapsed += elapsed_ms;
    if (g_step_elapsed >= step->duration_ms) {
        g_step_elapsed = 0;
        g_step_index++;
        if (g_step_index >= g_active_route_len) {
            g_enabled = 0;
            g_step_index = 0;
            (void)car_motor_stop();
            data->patrol_enabled = 0;
            data->motion = CAR_MOTION_STOP;
            printf("[car] patrol route complete\r\n");
        }
    }
}
