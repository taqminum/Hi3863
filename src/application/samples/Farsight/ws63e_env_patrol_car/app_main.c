/*
 * WS63E mobile environment patrol car sample.
 *
 * This is the project entry point for the single-board car plan. It wires the
 * current embedded modules together and stops short of hardware flashing.
 */

#include "app_init.h"
#include "board/car_board.h"
#include "cmsis_os2.h"
#include "comm/telemetry.h"
#include "comm/sle_client.h"
#include "comm/wifi_ap.h"
#include "display/oled_status.h"
#include "model/env_data.h"
#include "motor/car_motor.h"
#include "patrol/patrol_route.h"
#include "sensors/aht20.h"
#include "sensors/bh1750.h"
#include "stdio.h"

#define ENV_PATROL_TASK_STACK_SIZE 0x1800
#define ENV_PATROL_SAMPLE_PERIOD_MS 1000U
#define ENV_PATROL_CONTROL_PERIOD_MS 100U
#define ENV_PATROL_TICK_MS 10U
#define ENV_PATROL_SAMPLE_PERIOD_TICKS (ENV_PATROL_SAMPLE_PERIOD_MS / ENV_PATROL_TICK_MS)
#define ENV_PATROL_CONTROL_PERIOD_TICKS (ENV_PATROL_CONTROL_PERIOD_MS / ENV_PATROL_TICK_MS)
#define ENV_PATROL_FW_TAG "env-car-20260708-precheck-route"
#define ENV_PATROL_MOTOR_SELF_TEST_ON_BOOT 0
#define ENV_PATROL_MOTOR_DIAG_ON_BOOT 0
#define ENV_PATROL_MOTOR_TEST_SPEED 50U
#define ENV_PATROL_MOTOR_TEST_DURATION_TICKS 40U
#define ENV_PATROL_I2C_TIMEOUT_ERROR ((int)0x80001313)
#define CAR_TEMP_HIGH_X10 320
#define CAR_HUMI_HIGH_X10 800
#define CAR_LIGHT_LOW_X10 100

static void env_patrol_update_alerts(env_data_t *data)
{
    if (data == NULL) {
        return;
    }

    if (data->last_error != 0 || data->sample_seq == 0U) {
        data->temp_alert = 0U;
        data->humi_alert = 0U;
        data->light_alert = 0U;
        return;
    }

    data->temp_alert = (data->temperature_c_x10 >= CAR_TEMP_HIGH_X10) ? 1U : 0U;
    data->humi_alert = (data->humidity_rh_x10 >= CAR_HUMI_HIGH_X10) ? 1U : 0U;
    data->light_alert = (data->light_lux_x10 <= CAR_LIGHT_LOW_X10) ? 1U : 0U;
}

static void env_patrol_motor_self_test(void)
{
#if ENV_PATROL_MOTOR_SELF_TEST_ON_BOOT
    const car_motion_t motions[] = {
        CAR_MOTION_FORWARD,
        CAR_MOTION_BACKWARD,
        CAR_MOTION_LEFT,
        CAR_MOTION_RIGHT,
    };

    printf("[car] motor self-test begin; keep the car lifted\r\n");
    for (uint32_t i = 0; i < (sizeof(motions) / sizeof(motions[0])); i++) {
        car_motor_cmd_t cmd = {
            .motion = motions[i],
            .speed_percent = ENV_PATROL_MOTOR_TEST_SPEED,
            .duration_ms = ENV_PATROL_MOTOR_TEST_DURATION_TICKS * ENV_PATROL_TICK_MS,
        };
        (void)car_motor_command(&cmd);
        osDelay(ENV_PATROL_MOTOR_TEST_DURATION_TICKS);
        (void)car_motor_stop();
        osDelay(ENV_PATROL_MOTOR_TEST_DURATION_TICKS);
    }
    printf("[car] motor self-test end\r\n");
#else
    printf("[car] motor self-test disabled\r\n");
#endif
}

static void env_patrol_motor_diag_exip06(void)
{
#if ENV_PATROL_MOTOR_DIAG_ON_BOOT
    (void)car_motor_exip06_diag_forward();
#else
    printf("[car] motor exip06 diag disabled\r\n");
#endif
}

static void env_patrol_collect(env_data_t *data)
{
    int32_t temp_x10 = 0;
    uint32_t humi_x10 = 0;
    uint32_t light_x10 = 0;
    int sample_error = 0;

    int ret = aht20_read(&temp_x10, &humi_x10);
    if (ret == 0) {
        data->temperature_c_x10 = temp_x10;
        data->humidity_rh_x10 = humi_x10;
    } else {
        sample_error = ret;
        printf("[car] AHT20 read ret=0x%x\r\n", ret);
    }

    ret = bh1750_read(&light_x10);
    if (ret == 0) {
        data->light_lux_x10 = light_x10;
    } else {
        if (sample_error == 0) {
            sample_error = ret;
        }
        printf("[car] BH1750 read ret=0x%x\r\n", ret);
    }

    data->last_error = sample_error;
}

static void env_patrol_task(void *arg)
{
    (void)arg;

    env_data_t data;
    env_data_reset(&data);

    if (car_board_init() != 0) {
        return;
    }

    if (car_board_probe_i2c_devices() != 0) {
        printf("[car] i2c bus unhealthy; skip sensors/OLED/motor to avoid repeated bus timeouts\r\n");
        (void)telemetry_init();
        while (1) {
            data.sample_seq++;
            data.last_error = ENV_PATROL_I2C_TIMEOUT_ERROR;
            (void)telemetry_publish(&data);
            osDelay(ENV_PATROL_SAMPLE_PERIOD_TICKS);
        }
    }

    (void)aht20_init();
    (void)bh1750_init();
    (void)oled_status_init();
    (void)car_motor_init();
    env_patrol_motor_diag_exip06();
    env_patrol_motor_self_test();
    patrol_route_init();
    (void)car_wifi_ap_start();
    (void)car_sle_client_start();
    (void)telemetry_init();

    uint32_t sample_elapsed_ms = ENV_PATROL_SAMPLE_PERIOD_MS;
    while (1) {
        car_motor_tick(ENV_PATROL_CONTROL_PERIOD_MS);
        patrol_route_tick(ENV_PATROL_CONTROL_PERIOD_MS, &data);
        data.motion = car_motor_get_motion();

        sample_elapsed_ms += ENV_PATROL_CONTROL_PERIOD_MS;
        if (sample_elapsed_ms >= ENV_PATROL_SAMPLE_PERIOD_MS) {
            sample_elapsed_ms = 0;
            data.sample_seq++;
            env_patrol_collect(&data);
            env_patrol_update_alerts(&data);
            data.motion = car_motor_get_motion();
            oled_status_render(&data);
            (void)telemetry_publish(&data);
        }

        osDelay(ENV_PATROL_CONTROL_PERIOD_TICKS);
    }
}

static void ws63e_env_patrol_car_entry(void)
{
    printf("ws63e env patrol car boot\r\n");
    printf("[car] fw %s\r\n", ENV_PATROL_FW_TAG);

    osThreadAttr_t attr;
    attr.name = "env_patrol_task";
    attr.attr_bits = 0U;
    attr.cb_mem = NULL;
    attr.cb_size = 0U;
    attr.stack_mem = NULL;
    attr.stack_size = ENV_PATROL_TASK_STACK_SIZE;
    attr.priority = osPriorityNormal;

    if (osThreadNew((osThreadFunc_t)env_patrol_task, NULL, &attr) == NULL) {
        printf("[car] create env_patrol_task FAIL\r\n");
    }
}

app_run(ws63e_env_patrol_car_entry);
