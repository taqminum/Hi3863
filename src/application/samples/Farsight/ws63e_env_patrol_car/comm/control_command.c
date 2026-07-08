#include "control_command.h"

#include "stdio.h"
#include "string.h"

#define CONTROL_DEFAULT_SPEED 35U
#define CONTROL_DEFAULT_DURATION_MS 600U
#define CONTROL_MAX_DURATION_MS 3000U

static int parse_uint_field(const char *payload, const char *field, uint32_t *value)
{
    const char *pos = strstr(payload, field);
    if (pos == 0 || value == 0) {
        return -1;
    }

    pos = strchr(pos, ':');
    if (pos == 0) {
        return -1;
    }
    pos++;

    unsigned int parsed = 0;
    if (sscanf(pos, "%u", &parsed) != 1) {
        return -1;
    }
    *value = parsed;
    return 0;
}

static int parse_int_field(const char *payload, const char *field, int32_t *value)
{
    const char *pos = strstr(payload, field);
    if (pos == 0 || value == 0) {
        return -1;
    }

    pos = strchr(pos, ':');
    if (pos == 0) {
        return -1;
    }
    pos++;

    int parsed = 0;
    if (sscanf(pos, "%d", &parsed) != 1) {
        return -1;
    }
    *value = parsed;
    return 0;
}

static int8_t clamp_wheel_percent(int32_t value)
{
    if (value > 100) {
        return 100;
    }
    if (value < -100) {
        return -100;
    }
    return (int8_t)value;
}

static int payload_is_drive(const char *payload)
{
    return (strstr(payload, "\"drive\"") != 0 || strstr(payload, "drive") != 0);
}

static car_motion_t parse_motion(const char *payload)
{
    if (strstr(payload, "\"forward\"") != 0 || strstr(payload, "forward") != 0) {
        return CAR_MOTION_FORWARD;
    }
    if (strstr(payload, "\"backward\"") != 0 || strstr(payload, "backward") != 0) {
        return CAR_MOTION_BACKWARD;
    }
    if (strstr(payload, "\"left\"") != 0 || strstr(payload, "left") != 0) {
        return CAR_MOTION_LEFT;
    }
    if (strstr(payload, "\"right\"") != 0 || strstr(payload, "right") != 0) {
        return CAR_MOTION_RIGHT;
    }
    return CAR_MOTION_STOP;
}

int control_command_parse(const char *payload, car_motor_cmd_t *cmd)
{
    if (payload == 0 || cmd == 0) {
        return -1;
    }

    uint32_t speed = CONTROL_DEFAULT_SPEED;
    uint32_t duration_ms = CONTROL_DEFAULT_DURATION_MS;
    car_motion_t motion = parse_motion(payload);

    if (payload_is_drive(payload) != 0) {
        int32_t left = 0;
        int32_t right = 0;
        (void)parse_int_field(payload, "\"left\"", &left);
        (void)parse_int_field(payload, "\"right\"", &right);
        if (parse_uint_field(payload, "\"duration_ms\"", &duration_ms) != 0) {
            duration_ms = CONTROL_DEFAULT_DURATION_MS;
        }
        if (duration_ms > CONTROL_MAX_DURATION_MS) {
            duration_ms = CONTROL_MAX_DURATION_MS;
        }
        cmd->motion = CAR_MOTION_STOP;
        cmd->speed_percent = 0;
        cmd->duration_ms = (uint16_t)duration_ms;
        cmd->left_percent = clamp_wheel_percent(left);
        cmd->right_percent = clamp_wheel_percent(right);
        cmd->differential = 1;
        return 0;
    }

    if (parse_uint_field(payload, "\"speed\"", &speed) != 0) {
        speed = (motion == CAR_MOTION_STOP) ? 0U : CONTROL_DEFAULT_SPEED;
    }
    if (parse_uint_field(payload, "\"duration_ms\"", &duration_ms) != 0) {
        duration_ms = (motion == CAR_MOTION_STOP) ? 0U : CONTROL_DEFAULT_DURATION_MS;
    }

    if (speed > 100U) {
        speed = 100U;
    }
    if (duration_ms > CONTROL_MAX_DURATION_MS) {
        duration_ms = CONTROL_MAX_DURATION_MS;
    }

    cmd->motion = motion;
    cmd->speed_percent = (uint8_t)speed;
    cmd->duration_ms = (uint16_t)duration_ms;
    cmd->left_percent = 0;
    cmd->right_percent = 0;
    cmd->differential = 0;
    return 0;
}

int control_command_apply(const char *payload)
{
    car_motor_cmd_t cmd;
    int ret = control_command_parse(payload, &cmd);
    if (ret != 0) {
        printf("[car] control parse failed\r\n");
        return ret;
    }

    printf("[car] control apply motion=%u speed=%u duration=%u differential=%u left=%d right=%d\r\n",
        cmd.motion, cmd.speed_percent, cmd.duration_ms, cmd.differential, cmd.left_percent, cmd.right_percent);
    return car_motor_manual_command(&cmd);
}
