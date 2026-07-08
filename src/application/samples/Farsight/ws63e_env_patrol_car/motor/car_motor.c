#include "car_motor.h"

#include "../board/car_board.h"
#include "../drivers/i2c_bus.h"

#ifdef CAR_MOTOR_HOST_TEST
#include <stdint.h>
void osDelay(uint32_t ticks);
#else
#include "cmsis_os2.h"
#endif
#include "stdio.h"

#define CAR_MOTOR_PERIOD_TICKS 1000U
#define CAR_MOTOR_MIN_EFFECTIVE_PERCENT 20U
#define CAR_MOTOR_FREQ_SETTLE_TICKS 10U
#define CAR_MOTOR_MANUAL_CMD_TIMEOUT_MS 800U

#define WHEEL_PWM_FREQ_SET_BYTE 0x16
#define WHEEL_LEFT_A_REG 0x70
#define WHEEL_LEFT_B_REG 0x80
#define WHEEL_RIGHT_A_REG 0x90
#define WHEEL_RIGHT_B_REG 0xA0

static uint8_t g_motor_addr = CAR_I2C_ADDR_WHEEL_PWM;
static uint8_t g_motor_available = 0;
static uint8_t g_manual_watchdog_active = 0;
static uint32_t g_manual_watchdog_remaining_ms = 0;
static uint8_t g_manual_speed_percent = 0;
static int8_t g_manual_left_percent = 0;
static int8_t g_manual_right_percent = 0;
static uint8_t g_manual_differential = 0;
static car_motion_t g_current_motion = CAR_MOTION_STOP;

typedef struct {
    uint8_t left_forward;
    uint8_t left_reverse;
    uint8_t right_forward;
    uint8_t right_reverse;
} car_motor_direction_map_t;

static const car_motor_direction_map_t g_direction_map = {
    .left_forward = 1,
    .left_reverse = 0,
    .right_forward = 1,
    .right_reverse = 0,
};

static uint16_t motor_speed_to_ticks(uint8_t speed_percent)
{
    if (speed_percent > 100U) {
        speed_percent = 100U;
    }
    if (speed_percent == 0U) {
        return 0;
    }
    if (speed_percent <= 45U) {
        return 280U;
    }
    if (speed_percent <= 75U) {
        return 650U;
    }
    return CAR_MOTOR_PERIOD_TICKS;
}

static int8_t motor_clamp_wheel_percent(int16_t percent)
{
    if (percent > 100) {
        return 100;
    }
    if (percent < -100) {
        return -100;
    }
    return (int8_t)percent;
}

static uint16_t motor_wheel_percent_to_ticks(int8_t percent)
{
    int16_t magnitude = percent;
    if (magnitude < 0) {
        magnitude = (int16_t)(-magnitude);
    }
    return motor_speed_to_ticks((uint8_t)magnitude);
}

static int motor_write_pwm_to(uint8_t addr, uint8_t reg, uint16_t duty)
{
    uint8_t buf[3] = {
        reg,
        (uint8_t)((duty >> 8) & 0xFFU),
        (uint8_t)(duty & 0xFFU),
    };
    int ret = car_i2c_write(addr, buf, sizeof(buf));
    printf("[car] motor write addr=0x%02X reg=0x%02X hi=0x%02X lo=0x%02X duty=%u ret=0x%x\r\n",
        addr, buf[0], buf[1], buf[2], duty, ret);
    return ret;
}

static int motor_write_pwm(uint8_t reg, uint16_t duty)
{
    return motor_write_pwm_to(g_motor_addr, reg, duty);
}

static int motor_write_freq_to(uint8_t addr)
{
    uint8_t buf[1] = {WHEEL_PWM_FREQ_SET_BYTE};
    int ret = car_i2c_write(addr, buf, sizeof(buf));
    printf("[car] motor write addr=0x%02X freq=0x%02X ret=0x%x\r\n", addr, buf[0], ret);
    return ret;
}

static int motor_set_wheel(uint8_t coast_reg, uint8_t drive_reg, uint16_t duty, uint16_t limit, int forward)
{
    if (duty > limit) {
        duty = limit;
    }

    uint8_t zero_reg = coast_reg;
    uint8_t duty_reg = drive_reg;
    if (!forward) {
        zero_reg = drive_reg;
        duty_reg = coast_reg;
    }

    int ret = motor_write_pwm(zero_reg, 0);
    if (ret != 0) {
        return ret;
    }
    return motor_write_pwm(duty_reg, duty);
}

static int motor_left_set(uint16_t duty, int forward)
{
    return motor_set_wheel(WHEEL_LEFT_A_REG, WHEEL_LEFT_B_REG, duty, CAR_MOTOR_PERIOD_TICKS, forward);
}

static int motor_right_set(uint16_t duty, int forward)
{
    return motor_set_wheel(WHEEL_RIGHT_A_REG, WHEEL_RIGHT_B_REG, duty, CAR_MOTOR_PERIOD_TICKS, forward);
}

static int motor_apply(uint16_t left_duty, int left_forward, uint16_t right_duty, int right_forward)
{
    int ret_left = motor_left_set(left_duty, left_forward);
    int ret_right = motor_right_set(right_duty, right_forward);
    return (ret_left != 0) ? ret_left : ret_right;
}

static car_motion_t motor_estimate_motion(int8_t left_percent, int8_t right_percent)
{
    if (left_percent == 0 && right_percent == 0) {
        return CAR_MOTION_STOP;
    }
    if (left_percent >= 0 && right_percent >= 0) {
        return CAR_MOTION_FORWARD;
    }
    if (left_percent <= 0 && right_percent <= 0) {
        return CAR_MOTION_BACKWARD;
    }
    return (left_percent > right_percent) ? CAR_MOTION_RIGHT : CAR_MOTION_LEFT;
}

static int motor_try_stop_at(uint8_t addr)
{
    int ret = motor_write_freq_to(addr);
    if (ret != 0) {
        return ret;
    }
    osDelay(CAR_MOTOR_FREQ_SETTLE_TICKS);
    ret = motor_write_pwm_to(addr, WHEEL_LEFT_A_REG, 0);
    if (ret != 0) {
        return ret;
    }
    ret = motor_write_pwm_to(addr, WHEEL_LEFT_B_REG, 0);
    if (ret != 0) {
        return ret;
    }
    ret = motor_write_pwm_to(addr, WHEEL_RIGHT_A_REG, 0);
    if (ret != 0) {
        return ret;
    }
    return motor_write_pwm_to(addr, WHEEL_RIGHT_B_REG, 0);
}

int car_motor_init(void)
{
    int ret = motor_try_stop_at(CAR_I2C_ADDR_WHEEL_PWM);
    if (ret == 0) {
        g_motor_addr = CAR_I2C_ADDR_WHEEL_PWM;
        g_motor_available = 1;
    } else {
        int legacy_ret = motor_try_stop_at(CAR_I2C_ADDR_STM8S_MOTOR_LEGACY);
        if (legacy_ret == 0) {
            g_motor_addr = CAR_I2C_ADDR_STM8S_MOTOR_LEGACY;
            g_motor_available = 1;
            ret = 0;
        } else {
            int compat_ret = motor_try_stop_at(CAR_I2C_ADDR_STM8S_MOTOR_COMPAT);
            if (compat_ret == 0) {
                g_motor_addr = CAR_I2C_ADDR_STM8S_MOTOR_COMPAT;
                g_motor_available = 1;
                ret = 0;
            } else {
                g_motor_available = 0;
                printf("[car] motor bridge address detect failed wheel=0x%x ret=0x%x legacy=0x%x ret=0x%x compat=0x%x ret=0x%x\r\n",
                    CAR_I2C_ADDR_WHEEL_PWM, ret, CAR_I2C_ADDR_STM8S_MOTOR_LEGACY, legacy_ret,
                    CAR_I2C_ADDR_STM8S_MOTOR_COMPAT, compat_ret);
            }
        }
    }

    printf("[car] motor init via exip06/she_docs PWM bridge to L9110S addr=0x%02X ret=0x%x\r\n",
        g_motor_addr, ret);
    if (g_motor_available == 0) {
        printf("[car] motor unavailable; skip cmd until STM8S bridge ACKs\r\n");
        return ret;
    }
    return car_motor_stop();
}

int car_motor_command(const car_motor_cmd_t *cmd)
{
    if (cmd == 0 || cmd->speed_percent > 100U) {
        printf("[car] motor cmd invalid\r\n");
        return -1;
    }

    if (g_motor_available == 0) {
        printf("[car] motor unavailable; skip cmd motion=%u speed=%u duration=%u\r\n",
            cmd->motion, cmd->speed_percent, cmd->duration_ms);
        return -2;
    }

    uint16_t duty = motor_speed_to_ticks(cmd->speed_percent);
    int ret = 0;

    switch (cmd->motion) {
        case CAR_MOTION_FORWARD:
            ret = motor_apply(duty, g_direction_map.left_forward, duty, g_direction_map.right_reverse);
            break;
        case CAR_MOTION_BACKWARD:
            ret = motor_apply(duty, g_direction_map.left_reverse, duty, g_direction_map.right_forward);
            break;
        case CAR_MOTION_LEFT:
            ret = motor_apply(duty, g_direction_map.left_forward, duty, g_direction_map.right_forward);
            break;
        case CAR_MOTION_RIGHT:
            ret = motor_apply(duty, g_direction_map.left_reverse, duty, g_direction_map.right_reverse);
            break;
        case CAR_MOTION_STOP:
        default:
            ret = motor_apply(0, g_direction_map.left_forward, 0, g_direction_map.right_forward);
            break;
    }

    printf("[car] motor cmd addr=0x%02X motion=%u speed=%u duty=%u duration=%u ret=0x%x\r\n",
        g_motor_addr, cmd->motion, cmd->speed_percent, duty, cmd->duration_ms, ret);
    if (ret == 0) {
        g_current_motion = cmd->motion;
    }
    return ret;
}

int car_motor_drive(int8_t left_percent, int8_t right_percent, uint16_t duration_ms)
{
    (void)duration_ms;

    if (g_motor_available == 0) {
        printf("[car] motor unavailable; skip drive left=%d right=%d duration=%u\r\n",
            left_percent, right_percent, duration_ms);
        return -2;
    }

    left_percent = motor_clamp_wheel_percent(left_percent);
    right_percent = motor_clamp_wheel_percent(right_percent);

    uint16_t left_duty = motor_wheel_percent_to_ticks(left_percent);
    uint16_t right_duty = motor_wheel_percent_to_ticks(right_percent);
    int ret = motor_apply(left_duty,
        left_percent >= 0 ? g_direction_map.left_forward : g_direction_map.left_reverse,
        right_duty,
        right_percent >= 0 ? g_direction_map.right_reverse : g_direction_map.right_forward);

    printf("[car] motor drive addr=0x%02X left=%d right=%d left_duty=%u right_duty=%u duration=%u ret=0x%x\r\n",
        g_motor_addr, left_percent, right_percent, left_duty, right_duty, duration_ms, ret);
    if (ret == 0) {
        g_current_motion = motor_estimate_motion(left_percent, right_percent);
    }
    return ret;
}

int car_motor_manual_command(const car_motor_cmd_t *cmd)
{
    if (cmd == 0) {
        return -1;
    }

    uint32_t watchdog_ms = cmd->duration_ms;
    if (watchdog_ms == 0U && cmd->motion != CAR_MOTION_STOP) {
        watchdog_ms = CAR_MOTOR_MANUAL_CMD_TIMEOUT_MS;
    }

    if (cmd->differential != 0) {
        if (g_manual_watchdog_active != 0 && g_manual_differential != 0 &&
            cmd->left_percent == g_manual_left_percent && cmd->right_percent == g_manual_right_percent) {
            g_manual_watchdog_remaining_ms = watchdog_ms;
            printf("[car] motor manual drive refresh left=%d right=%d duration=%u\r\n",
                cmd->left_percent, cmd->right_percent, (unsigned int)watchdog_ms);
            return 0;
        }

        int ret = car_motor_drive(cmd->left_percent, cmd->right_percent, cmd->duration_ms);
        if (ret != 0) {
            return ret;
        }

        if (cmd->left_percent == 0 && cmd->right_percent == 0) {
            g_manual_watchdog_active = 0;
            g_manual_watchdog_remaining_ms = 0;
            g_manual_speed_percent = 0;
            g_manual_left_percent = 0;
            g_manual_right_percent = 0;
            g_manual_differential = 0;
            return ret;
        }

        g_manual_watchdog_active = 1;
        g_manual_watchdog_remaining_ms = watchdog_ms;
        g_manual_speed_percent = 0;
        g_manual_left_percent = cmd->left_percent;
        g_manual_right_percent = cmd->right_percent;
        g_manual_differential = 1;
        return ret;
    }

    if (g_manual_watchdog_active != 0 && g_manual_differential == 0 && cmd->motion != CAR_MOTION_STOP &&
        cmd->motion == g_current_motion && cmd->speed_percent == g_manual_speed_percent) {
        g_manual_watchdog_remaining_ms = watchdog_ms;
        printf("[car] motor manual refresh motion=%u speed=%u duration=%u\r\n",
            cmd->motion, cmd->speed_percent, (unsigned int)watchdog_ms);
        return 0;
    }

    int ret = car_motor_command(cmd);
    if (ret != 0) {
        return ret;
    }

    if (cmd->motion == CAR_MOTION_STOP) {
        g_manual_watchdog_active = 0;
        g_manual_watchdog_remaining_ms = 0;
        g_manual_speed_percent = 0;
        g_manual_left_percent = 0;
        g_manual_right_percent = 0;
        g_manual_differential = 0;
        return ret;
    }

    g_manual_watchdog_active = 1;
    g_manual_watchdog_remaining_ms = watchdog_ms;
    g_manual_speed_percent = cmd->speed_percent;
    g_manual_left_percent = 0;
    g_manual_right_percent = 0;
    g_manual_differential = 0;
    return ret;
}

int car_motor_stop(void)
{
    car_motor_cmd_t cmd = {
        .motion = CAR_MOTION_STOP,
        .speed_percent = 0,
        .duration_ms = 0,
        .left_percent = 0,
        .right_percent = 0,
        .differential = 0,
    };
    return car_motor_command(&cmd);
}

void car_motor_tick(uint32_t elapsed_ms)
{
    if (g_manual_watchdog_active == 0) {
        return;
    }

    if (elapsed_ms >= g_manual_watchdog_remaining_ms) {
        g_manual_watchdog_active = 0;
        g_manual_watchdog_remaining_ms = 0;
        printf("[car] motor manual watchdog timeout -> stop\r\n");
        (void)car_motor_stop();
        return;
    }

    g_manual_watchdog_remaining_ms -= elapsed_ms;
}

car_motion_t car_motor_get_motion(void)
{
    return g_current_motion;
}

int car_motor_exip06_diag_forward(void)
{
    const uint16_t duty = 500U;
    const uint16_t hold_ticks = 300U;

    if (g_motor_available == 0) {
        printf("[car] motor exip06 diag skip; bridge unavailable\r\n");
        return -2;
    }

    printf("[car] motor exip06 diag forward begin; lift the car\r\n");
    int ret = motor_write_freq_to(g_motor_addr);
    if (ret != 0) {
        return ret;
    }
    osDelay(CAR_MOTOR_FREQ_SETTLE_TICKS);

    ret = motor_left_set(duty, 1);
    if (ret != 0) {
        (void)car_motor_stop();
        return ret;
    }

    ret = motor_right_set(duty, 1);
    if (ret != 0) {
        (void)car_motor_stop();
        return ret;
    }

    printf("[car] motor exip06 diag forward hold duty=%u ticks=%u\r\n", duty, hold_ticks);
    osDelay(hold_ticks);
    ret = car_motor_stop();
    printf("[car] motor exip06 diag forward end ret=0x%x\r\n", ret);
    return ret;
}
