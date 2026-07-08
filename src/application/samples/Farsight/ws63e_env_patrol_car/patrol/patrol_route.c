#include "patrol_route.h"

#include "../motor/car_motor.h"

#include "stdio.h"

typedef struct {
    car_motion_t motion;
    uint8_t speed_percent;
    uint16_t duration_ms;
} patrol_step_t;

static const patrol_step_t g_route[] = {
    {CAR_MOTION_FORWARD, 45, 3000},
    {CAR_MOTION_LEFT, 35, 600},
    {CAR_MOTION_FORWARD, 45, 3000},
    {CAR_MOTION_RIGHT, 35, 600},
    {CAR_MOTION_STOP, 0, 1000},
};

static uint8_t g_enabled;
static uint32_t g_step_index;
static uint32_t g_step_elapsed;

void patrol_route_init(void)
{
    g_enabled = 0;
    g_step_index = 0;
    g_step_elapsed = 0;
}

void patrol_route_start(void)
{
    g_enabled = 1;
    g_step_index = 0;
    g_step_elapsed = 0;
    printf("[car] timed patrol route start\r\n");
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
    printf("[car] timed patrol route stop\r\n");
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

    const patrol_step_t *step = &g_route[g_step_index];
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
        if (g_step_index >= (sizeof(g_route) / sizeof(g_route[0]))) {
            g_step_index = 0;
        }
    }
}
