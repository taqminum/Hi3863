# 小车固件 OLED 显示、PWM 驱动与传感器周期采集说明

本文档整理当前 WS63E 环境巡检小车固件中 OLED 显示、PWM 电机驱动和环境传感器周期采集三部分代码，供项目报告、答辩材料和演示说明引用。

对应源码位于：

- `src/application/samples/Farsight/ws63e_env_patrol_car/app_main.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/display/oled_status.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/motor/car_motor.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/sensors/aht20.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/sensors/bh1750.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/drivers/i2c_bus.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/board/car_board.c`
- `src/application/samples/Farsight/ws63e_env_patrol_car/model/env_data.h`

## 1. 总体集成方式

小车固件以 `app_main.c` 中的 `env_patrol_task` 作为主任务入口。系统上电后先完成板级 I2C 初始化和设备探测，然后依次初始化 AHT20 温湿度传感器、BH1750 光照传感器、SSD1306 OLED 显示模块、I2C PWM 电机桥接模块、Wi-Fi AP、本地 HTTP 服务、SLE 客户端以及遥测发布模块。

主循环采用 100ms 控制周期和 1000ms 采样周期：

- 每 100ms 调用 `car_motor_tick()` 和 `patrol_route_tick()`，用于电机手动控制超时保护和自动巡检路线推进。
- 每累计 1000ms 执行一次环境数据采集，读取温度、湿度、光照数据。
- 每次采集完成后更新告警状态、刷新 OLED 显示，并通过遥测模块发布当前数据。

核心调度参数如下：

| 参数 | 当前值 | 作用 |
| --- | --- | --- |
| `ENV_PATROL_CONTROL_PERIOD_MS` | 100ms | 电机控制和巡检路线 tick 周期 |
| `ENV_PATROL_SAMPLE_PERIOD_MS` | 1000ms | 传感器采集、OLED 刷新、遥测发布周期 |
| `CAR_TEMP_HIGH_X10` | 320 | 温度高告警阈值，表示 32.0 摄氏度 |
| `CAR_HUMI_HIGH_X10` | 800 | 湿度高告警阈值，表示 80.0%RH |
| `CAR_LIGHT_LOW_X10` | 100 | 光照低告警阈值，表示 10.0 lux |

报告表述可写为：

> 小车端固件采用周期性任务调度方式，将运动控制、巡检路线推进、环境传感器采样、OLED 状态显示和遥测上报统一整合在主任务循环中。控制链路以 100ms 为节拍保证响应性，环境采集链路以 1s 为周期降低总线压力并提供稳定的数据刷新频率。

## 2. I2C 总线与硬件地址管理

OLED、AHT20、BH1750 和电机 PWM 桥接模块均通过 I2C 总线访问。板级配置集中在 `board/car_board.h`，总线封装集中在 `drivers/i2c_bus.c`。

当前 I2C 配置：

| 项目 | 配置 |
| --- | --- |
| I2C 总线 | `CAR_I2C_BUS = 1` |
| SCL 引脚 | GPIO15 |
| SDA 引脚 | GPIO16 |
| 引脚复用模式 | `CAR_I2C_PIN_MODE = 2` |
| 总线速率 | 100kHz |

关键设备地址：

| 模块 | 地址 | 说明 |
| --- | --- | --- |
| BH1750 | `0x23` | 光照传感器 |
| AHT20 | `0x38` | 温湿度传感器 |
| SSD1306 OLED | `0x3C` | 本地显示屏 |
| 车轮 PWM 桥接模块 | `0x5A` | exip06 / she_docs 电机 PWM 桥 |
| STM8S 兼容地址 | `0x15` / `0x2A` | 历史兼容探测地址 |

`car_board_probe_i2c_devices()` 会在启动阶段扫描核心 I2C 设备。若 BH1750、AHT20、SSD1306 三个核心设备中至少两个应答，则认为 I2C 核心链路可用；如果全部失败，会重置 I2C 控制器并重新探测核心设备。若仍无法满足条件，主任务会跳过传感器、OLED 和电机初始化，避免反复 I2C 超时拖垮系统。

报告表述可写为：

> 固件将多类外设统一抽象到 I2C 总线层，板级文件集中管理引脚、速率和设备地址，业务模块只调用 `car_i2c_read` / `car_i2c_write` 完成设备访问。这种设计降低了模块耦合度，也便于后续替换传感器或调整硬件地址。

## 3. OLED 状态显示

OLED 显示逻辑位于 `display/oled_status.c`。初始化函数 `oled_status_init()` 调用 she_docs 中的 SSD1306 驱动完成屏幕初始化、清屏，并显示启动标题 `WS63E Patrol`。

运行中通过 `oled_status_render(const env_data_t *data)` 刷新四行状态：

| 行号 | 正常显示内容 | 异常或告警显示 |
| --- | --- | --- |
| 第 1 行 | `WS63E Patrol` | 出现告警时显示 `WS63E ALERT` |
| 第 2 行 | 温度和湿度，如 `T:29.7 H:65.8` | 数据无效时显示 `T:--.- H:--.-` |
| 第 3 行 | 光照，如 `L:403.0 lx` | 数据无效时显示 `L:----.- lx` |
| 第 4 行 | 运动状态和 Wi-Fi 状态，如 `FWD W:AP` | 错误码或 `ALERT W:AP` |

显示模块不直接读取传感器，也不直接控制网络状态，而是根据统一数据结构 `env_data_t` 渲染状态。这样 OLED 仅承担本地可视化职责，业务数据由采集模块和控制模块提供。

OLED 展示的运动状态来自 `car_motor_get_motion()`，Wi-Fi 状态来自 `car_wifi_ap_get_state()`。显示模块将底层枚举转换为短文本，例如：

- `CAR_MOTION_FORWARD` -> `FWD`
- `CAR_MOTION_BACKWARD` -> `BACK`
- `CAR_MOTION_LEFT` -> `LEFT`
- `CAR_MOTION_RIGHT` -> `RIGHT`
- `CAR_MOTION_STOP` -> `STOP`
- `CAR_WIFI_STATE_READY` -> `W:AP`
- `CAR_WIFI_STATE_ERROR` -> `W:ERR`

报告表述可写为：

> OLED 屏幕用于提供小车端的本地状态反馈。它能够在无手机、无云端页面的情况下直接显示温湿度、光照、运动方向、Wi-Fi AP 状态和传感器异常码，方便现场调试和演示时快速判断小车端是否正常工作。

## 4. PWM 电机驱动

电机控制逻辑位于 `motor/car_motor.c`。当前小车并非由 WS63E GPIO 直接输出 PWM，而是通过 I2C 访问车轮 PWM 桥接模块，再由该桥接模块驱动 L9110S 电机驱动电路。

该模块的关键寄存器配置如下：

| 寄存器/命令 | 值 | 作用 |
| --- | --- | --- |
| `WHEEL_PWM_FREQ_SET_BYTE` | `0x16` | 设置 PWM 输出频率 |
| `WHEEL_LEFT_A_REG` | `0x70` | 左轮 A 路 PWM |
| `WHEEL_LEFT_B_REG` | `0x80` | 左轮 B 路 PWM |
| `WHEEL_RIGHT_A_REG` | `0x90` | 右轮 A 路 PWM |
| `WHEEL_RIGHT_B_REG` | `0xA0` | 右轮 B 路 PWM |

### 4.1 初始化和兼容地址探测

`car_motor_init()` 会先尝试在 `0x5A` 地址访问 PWM 桥接模块。如果失败，再依次尝试历史兼容地址 `0x15` 和 `0x2A`。探测成功后调用 `car_motor_stop()` 将四路 PWM 输出清零，确保上电后电机处于安全停止状态。

报告表述可写为：

> 电机驱动初始化包含地址探测和安全停止两个步骤。固件优先使用当前硬件的 PWM 桥地址，同时保留历史兼容地址探测，提高了不同硬件批次下的适配能力；初始化成功后立即清零电机输出，避免上电误动作。

### 4.2 速度映射

APP 或巡检路线传入的是 0 到 100 的速度百分比。固件通过 `motor_speed_to_ticks()` 将百分比转换为 PWM duty tick：

| 速度百分比 | PWM duty |
| --- | --- |
| 0 | 0 |
| 1 到 45 | 280 |
| 46 到 75 | 650 |
| 76 到 100 | 1000 |

这种离散映射方式适合小车低成本电机的实际运动特性：低占空比可能无法克服静摩擦，因此固件为低速段提供最小有效 duty，保证动作可见；中高速段再提高 duty，提升运动速度。

### 4.3 方向控制

电机模块将左右轮的正反转映射为四路 PWM 输出。典型动作如下：

| 动作 | 左轮 | 右轮 |
| --- | --- | --- |
| 前进 | 左轮正向 | 右轮反向 |
| 后退 | 左轮反向 | 右轮正向 |
| 左转 | 左轮正向 | 右轮正向 |
| 右转 | 左轮反向 | 右轮反向 |
| 停止 | 左右轮 duty 为 0 | 左右轮 duty 为 0 |

实际方向映射由 `g_direction_map` 控制，便于在电机接线或驱动方向不一致时集中调整。

### 4.4 差速控制和手动看门狗

除前进、后退、左转、右转、停止等离散动作外，模块还提供 `car_motor_drive(left_percent, right_percent, duration_ms)` 差速控制接口，用于 APP 摇杆控制。左右轮百分比范围限制在 -100 到 100，正负号表示方向，绝对值表示速度。

手动控制使用 `car_motor_manual_command()`，内部带有 800ms 默认看门狗。如果 APP 连续发送摇杆指令，固件只刷新剩余时间；如果控制指令中断，`car_motor_tick()` 会在超时后自动调用 `car_motor_stop()`，避免通信断开后小车继续运动。

报告表述可写为：

> 电机驱动模块在支持常规方向动作的同时，也支持左右轮差速控制，满足手机摇杆连续控制需求。为了提升安全性，手动控制链路加入了超时看门狗；当无线控制指令中断时，小车会自动停止，降低失控风险。

## 5. 传感器周期性采集

传感器采集逻辑由 `app_main.c` 的 `env_patrol_collect()` 统一调用，底层分别访问 AHT20 和 BH1750。

### 5.1 AHT20 温湿度采集

AHT20 驱动位于 `sensors/aht20.c`。

初始化流程：

1. 向 AHT20 写入初始化命令 `{0xBE, 0x08, 0x00}`。
2. 延时 2 个 tick，等待传感器状态稳定。
3. 打印初始化返回值，便于串口调试。

采集流程：

1. 写入触发测量命令 `{0xAC, 0x33, 0x00}`。
2. 延时 8 个 tick 等待测量完成。
3. 读取 6 字节原始数据。
4. 检查忙标志 `0x80`，若仍忙返回错误。
5. 检查校准标志 `0x08`，若未校准返回错误。
6. 解析 20 bit 湿度原始值和 20 bit 温度原始值。
7. 转换为扩大 10 倍的物理值：
   - 湿度：`humidity_rh_x10 = raw_humi * 1000 / 1048576`
   - 温度：`temperature_c_x10 = raw_temp * 2000 / 1048576 - 500`

也就是说，`temperature_c_x10 = 297` 表示 29.7 摄氏度，`humidity_rh_x10 = 658` 表示 65.8%RH。

### 5.2 BH1750 光照采集

BH1750 驱动位于 `sensors/bh1750.c`。

初始化流程：

1. 写入 `0x01`，打开 BH1750 电源。
2. 延时 2 个 tick。
3. 写入 `0x10`，进入连续高分辨率测量模式。

采集流程：

1. 从 BH1750 读取 2 字节原始光照数据。
2. 将高低字节组合为 16 bit 数值。
3. 按公式转换为扩大 10 倍的 lux 值：
   - `light_lux_x10 = raw_value * 100 / 12`

因此，`light_lux_x10 = 4030` 表示 403.0 lux。

### 5.3 采集错误处理

`env_patrol_collect()` 会分别读取 AHT20 和 BH1750。如果某一路读取失败，会保留另一传感器的有效数据，并将第一个错误码写入 `data->last_error`。OLED 和遥测发布都会携带这个错误码。

当 `last_error != 0` 或尚未产生有效样本时，告警逻辑会清零温度、湿度、光照告警，OLED 显示占位值或错误码，避免把无效数据误判为真实异常。

报告表述可写为：

> 传感器采集采用统一数据结构保存温度、湿度、光照和错误状态。采集周期为 1 秒，既保证了环境数据的实时性，又避免了频繁 I2C 访问造成的总线负载和显示抖动。驱动层对传感器忙状态、校准状态和 I2C 读写错误进行检测，应用层则统一处理错误码和告警状态。

## 6. 统一数据结构

传感器、OLED、电机状态和告警信息通过 `model/env_data.h` 中的 `env_data_t` 结构传递：

| 字段 | 含义 |
| --- | --- |
| `temperature_c_x10` | 温度，摄氏度扩大 10 倍 |
| `humidity_rh_x10` | 相对湿度，百分比扩大 10 倍 |
| `light_lux_x10` | 光照强度，lux 扩大 10 倍 |
| `temp_alert` | 温度告警 |
| `humi_alert` | 湿度告警 |
| `light_alert` | 光照告警 |
| `motion` | 当前运动状态 |
| `patrol_enabled` | 自动巡检是否运行 |
| `sample_seq` | 采样序号 |
| `last_error` | 最近一次采样错误码 |

该结构是小车固件内部的数据中枢：传感器模块写入环境数值，电机模块提供运动状态，告警逻辑写入告警标志，OLED 和遥测模块读取它进行展示和上报。

## 7. 报告可用总结

可在报告中将这一部分总结为：

> 小车端固件完成了本地感知、显示和运动控制的集成。系统通过 I2C 总线连接 AHT20 温湿度传感器、BH1750 光照传感器、SSD1306 OLED 屏和 PWM 电机桥接模块。主任务以 100ms 为控制周期推进电机控制和巡检路线，以 1s 为采样周期读取环境数据、刷新 OLED 并发布遥测。OLED 用于现场显示温湿度、光照、运动方向、Wi-Fi 状态和异常码；电机模块通过 I2C PWM 桥控制 L9110S，实现前进、后退、转向、停止和差速摇杆控制，并加入手动控制超时保护。传感器模块将原始数据统一转换为扩大 10 倍的定点数，便于嵌入式端避免浮点计算，并通过统一数据结构供显示、遥测和告警逻辑复用。

## 8. 调试与验收关注点

调试时可通过串口和 OLED 同时观察：

- 串口出现 `i2c init OK`，表示 I2C 总线初始化成功。
- 串口出现核心设备 probe 结果，至少 BH1750、AHT20、SSD1306 中两个 ACK。
- OLED 显示 `WS63E Patrol`，说明 SSD1306 初始化成功。
- OLED 第二、三行出现温湿度和光照数值，说明传感器采集有效。
- 遮挡光照传感器后，光照值应随环境变化下降。
- APP 遥控时 OLED 第四行运动状态应在 `FWD`、`BACK`、`LEFT`、`RIGHT`、`STOP` 间变化。
- 若 APP 控制链路中断，小车应在看门狗超时后停止。
## 9. 交接源码清单

以下源码直接摘自当前小车固件目录，覆盖 OLED 显示、I2C PWM 电机驱动、AHT20/BH1750 周期采集、I2C 总线封装和主任务调度。交接或报告编写时可直接引用本节，不必再逐个查找源码文件。

### 9.1 `app_main.c`

```c
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
```
### 9.2 `model/env_data.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_ENV_DATA_H
#define WS63E_ENV_PATROL_CAR_ENV_DATA_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CAR_MOTION_STOP = 0,
    CAR_MOTION_FORWARD,
    CAR_MOTION_BACKWARD,
    CAR_MOTION_LEFT,
    CAR_MOTION_RIGHT,
} car_motion_t;

typedef struct {
    int32_t temperature_c_x10;
    uint32_t humidity_rh_x10;
    uint32_t light_lux_x10;
    uint8_t temp_alert;
    uint8_t humi_alert;
    uint8_t light_alert;
    car_motion_t motion;
    uint8_t patrol_enabled;
    uint32_t sample_seq;
    int last_error;
} env_data_t;

static inline void env_data_reset(env_data_t *data)
{
    if (data == 0) {
        return;
    }
    data->temperature_c_x10 = 0;
    data->humidity_rh_x10 = 0;
    data->light_lux_x10 = 0;
    data->temp_alert = 0;
    data->humi_alert = 0;
    data->light_alert = 0;
    data->motion = CAR_MOTION_STOP;
    data->patrol_enabled = 0;
    data->sample_seq = 0;
    data->last_error = 0;
}

#ifdef __cplusplus
}
#endif

#endif
```

### 9.3 `display/oled_status.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_OLED_STATUS_H
#define WS63E_ENV_PATROL_CAR_OLED_STATUS_H

#include "../model/env_data.h"

#ifdef __cplusplus
extern "C" {
#endif

int oled_status_init(void);
void oled_status_render(const env_data_t *data);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.4 `display/oled_status.c`

```c
#include "oled_status.h"

#include "../comm/wifi_ap.h"
#include "../../../../../../she_docs/ssd1306.h"

#include "stdio.h"

static int decimal_abs(int value)
{
    return (value < 0) ? -value : value;
}

static int env_data_has_valid_sample(const env_data_t *data)
{
    return (data != 0) && (data->sample_seq > 0U) && (data->last_error == 0);
}

static int env_data_has_alert(const env_data_t *data)
{
    return (data != 0) && (data->temp_alert != 0U || data->humi_alert != 0U || data->light_alert != 0U);
}

static const char *motion_name(car_motion_t motion)
{
    switch (motion) {
        case CAR_MOTION_FORWARD:
            return "FWD";
        case CAR_MOTION_BACKWARD:
            return "BACK";
        case CAR_MOTION_LEFT:
            return "LEFT";
        case CAR_MOTION_RIGHT:
            return "RIGHT";
        case CAR_MOTION_STOP:
        default:
            return "STOP";
    }
}

static const char *wifi_state_name(car_wifi_state_t state)
{
    switch (state) {
        case CAR_WIFI_STATE_STARTING:
            return "W:BOOT";
        case CAR_WIFI_STATE_READY:
            return "W:AP";
        case CAR_WIFI_STATE_ERROR:
            return "W:ERR";
        case CAR_WIFI_STATE_IDLE:
        default:
            return "W:IDLE";
    }
}

int oled_status_init(void)
{
    printf("[car] OLED init via she_docs SSD1306 driver\r\n");
    ssd1306_Init();
    ssd1306_ClearOLED();
    ssd1306_printf("WS63E Patrol");
    return 0;
}

void oled_status_render(const env_data_t *data)
{
    if (data == 0) {
        return;
    }

    char line0[18];
    char line1[18];
    char line2[18];
    char line3[18];

    (void)snprintf(line0, sizeof(line0), "%s", env_data_has_alert(data) ? "WS63E ALERT" : "WS63E Patrol");
    if (env_data_has_valid_sample(data)) {
        int temp_frac = decimal_abs(data->temperature_c_x10 % 10);
        int humi_frac = (int)(data->humidity_rh_x10 % 10U);
        int light_frac = (int)(data->light_lux_x10 % 10U);
        (void)snprintf(line1, sizeof(line1), "T:%d.%d H:%u.%d", data->temperature_c_x10 / 10,
            temp_frac, data->humidity_rh_x10 / 10U, humi_frac);
        (void)snprintf(line2, sizeof(line2), "L:%u.%d lx", data->light_lux_x10 / 10U, light_frac);
    } else {
        (void)snprintf(line1, sizeof(line1), "T:--.- H:--.-");
        (void)snprintf(line2, sizeof(line2), "L:----.- lx");
    }

    if (data->last_error != 0) {
        (void)snprintf(line3, sizeof(line3), "E:%X %s", (unsigned int)data->last_error,
            wifi_state_name(car_wifi_ap_get_state()));
    } else if (env_data_has_alert(data)) {
        (void)snprintf(line3, sizeof(line3), "ALERT %s", wifi_state_name(car_wifi_ap_get_state()));
    } else {
        (void)snprintf(line3, sizeof(line3), "%s %s", motion_name(data->motion),
            wifi_state_name(car_wifi_ap_get_state()));
    }

    ssd1306_ClearOLED();
    ssd1306_printf("%s", line0);
    ssd1306_printf("%s", line1);
    ssd1306_printf("%s", line2);
    ssd1306_printf("%s", line3);
}
```
### 9.5 `motor/car_motor.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_MOTOR_H
#define WS63E_ENV_PATROL_CAR_MOTOR_H

#include "../model/env_data.h"

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    car_motion_t motion;
    uint8_t speed_percent;
    uint16_t duration_ms;
    int8_t left_percent;
    int8_t right_percent;
    uint8_t differential;
} car_motor_cmd_t;

int car_motor_init(void);
int car_motor_command(const car_motor_cmd_t *cmd);
int car_motor_drive(int8_t left_percent, int8_t right_percent, uint16_t duration_ms);
int car_motor_manual_command(const car_motor_cmd_t *cmd);
int car_motor_stop(void);
int car_motor_exip06_diag_forward(void);
void car_motor_tick(uint32_t elapsed_ms);
car_motion_t car_motor_get_motion(void);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.6 `motor/car_motor.c`

```c
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
```

### 9.7 `sensors/aht20.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_AHT20_H
#define WS63E_ENV_PATROL_CAR_AHT20_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int aht20_init(void);
int aht20_read(int32_t *temperature_c_x10, uint32_t *humidity_rh_x10);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.8 `sensors/aht20.c`

```c
#include "aht20.h"

#include "../board/car_board.h"
#include "../drivers/i2c_bus.h"

#include "cmsis_os2.h"
#include "stdio.h"

#define AHT20_STATUS_BUSY 0x80
#define AHT20_STATUS_CALIBRATED 0x08
#define AHT20_RAW_FULL_SCALE 1048576ULL

int aht20_init(void)
{
    uint8_t cmd[] = {0xBE, 0x08, 0x00};
    int ret = car_i2c_write(CAR_I2C_ADDR_AHT20, cmd, sizeof(cmd));
    osDelay(2);
    printf("[car] AHT20 init ret=0x%x\r\n", ret);
    return ret;
}

int aht20_read(int32_t *temperature_c_x10, uint32_t *humidity_rh_x10)
{
    if (temperature_c_x10 == 0 || humidity_rh_x10 == 0) {
        return -1;
    }

    uint8_t trigger[] = {0xAC, 0x33, 0x00};
    int ret = car_i2c_write(CAR_I2C_ADDR_AHT20, trigger, sizeof(trigger));
    if (ret != 0) {
        return ret;
    }

    osDelay(8);

    uint8_t raw[6] = {0};
    ret = car_i2c_read(CAR_I2C_ADDR_AHT20, raw, sizeof(raw));
    if (ret != 0) {
        return ret;
    }
    if ((raw[0] & AHT20_STATUS_BUSY) != 0) {
        return -2;
    }
    if ((raw[0] & AHT20_STATUS_CALIBRATED) == 0) {
        return -3;
    }

    uint32_t raw_humi = ((uint32_t)raw[1] << 12) | ((uint32_t)raw[2] << 4) | ((uint32_t)raw[3] >> 4);
    uint32_t raw_temp = (((uint32_t)raw[3] & 0x0F) << 16) | ((uint32_t)raw[4] << 8) | raw[5];

    *humidity_rh_x10 = (uint32_t)(((uint64_t)raw_humi * 1000ULL) / AHT20_RAW_FULL_SCALE);
    *temperature_c_x10 = (int32_t)(((uint64_t)raw_temp * 2000ULL) / AHT20_RAW_FULL_SCALE) - 500;
    return 0;
}
```

### 9.9 `sensors/bh1750.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_BH1750_H
#define WS63E_ENV_PATROL_CAR_BH1750_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int bh1750_init(void);
int bh1750_read(uint32_t *light_lux_x10);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.10 `sensors/bh1750.c`

```c
#include "bh1750.h"

#include "../board/car_board.h"
#include "../drivers/i2c_bus.h"

#include "cmsis_os2.h"
#include "stdio.h"

#define BH1750_POWER_ON 0x01
#define BH1750_CONT_H_RES_MODE 0x10

static int bh1750_write_cmd(uint8_t cmd)
{
    return car_i2c_write(CAR_I2C_ADDR_BH1750, &cmd, sizeof(cmd));
}

int bh1750_init(void)
{
    int ret = bh1750_write_cmd(BH1750_POWER_ON);
    if (ret != 0) {
        printf("[car] BH1750 power on ret=0x%x\r\n", ret);
        return ret;
    }
    osDelay(2);
    ret = bh1750_write_cmd(BH1750_CONT_H_RES_MODE);
    printf("[car] BH1750 init ret=0x%x\r\n", ret);
    return ret;
}

int bh1750_read(uint32_t *light_lux_x10)
{
    if (light_lux_x10 == 0) {
        return -1;
    }

    uint8_t raw[2] = {0};
    int ret = car_i2c_read(CAR_I2C_ADDR_BH1750, raw, sizeof(raw));
    if (ret != 0) {
        return ret;
    }

    uint32_t value = ((uint32_t)raw[0] << 8) | raw[1];
    *light_lux_x10 = (value * 100U) / 12U;
    return 0;
}
```

### 9.11 `drivers/i2c_bus.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_I2C_BUS_H
#define WS63E_ENV_PATROL_CAR_I2C_BUS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int car_i2c_init(void);
int car_i2c_reset(void);
int car_i2c_write(uint8_t addr, const uint8_t *buf, uint32_t len);
int car_i2c_read(uint8_t addr, uint8_t *buf, uint32_t len);
int car_i2c_probe(uint8_t addr);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.12 `drivers/i2c_bus.c`

```c
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
```

### 9.13 `board/car_board.h`

```c
#ifndef WS63E_ENV_PATROL_CAR_BOARD_H
#define WS63E_ENV_PATROL_CAR_BOARD_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CAR_I2C_BUS 1
#define CAR_I2C_SCL_PIN 15
#define CAR_I2C_SDA_PIN 16
#define CAR_I2C_PIN_MODE 2
#define CAR_I2C_BAUDRATE 100000
#define CAR_I2C_MASTER_CODE 0

/* Sensor/OLED addresses follow the proven WS63 driver values from she_docs and hardware logs. */
#define CAR_I2C_ADDR_PCA9555 0x28
#define CAR_I2C_ADDR_PCA9555_SCHEMATIC 0x14
#define CAR_I2C_ADDR_WHEEL_PWM 0x5A
#define CAR_I2C_ADDR_STM8S_MOTOR_LEGACY 0x15
#define CAR_I2C_ADDR_STM8S_MOTOR_COMPAT 0x2A
#define CAR_I2C_ADDR_BH1750 0x23
#define CAR_I2C_ADDR_AHT20 0x38
#define CAR_I2C_ADDR_SSD1306 0x3C
#define CAR_I2C_ADDR_CW2015 0x62

int car_board_init(void);
int car_board_probe_i2c_devices(void);

#ifdef __cplusplus
}
#endif

#endif
```

### 9.14 `board/car_board.c`

```c
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
```
