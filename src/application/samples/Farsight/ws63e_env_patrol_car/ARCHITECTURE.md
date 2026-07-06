# Embedded Architecture

Final project title:
`基于WS63平台的移动式环境监测巡检小车与可视化智能分析系统`

This directory is the WS63E single-board embedded sample. Web/server parts are
outside this sample; the embedded side exposes data collection, local display,
movement control, Wi-Fi upload/control, and optional SLE exchange.

At the current milestone, the car firmware already provides:

- serial telemetry
- local OLED status
- SoftAP + on-car HTTP root page
- `GET /api/data`
- `POST /api/control`
- timed open-loop preset patrol start/stop

The local dashboard under `tools/env_patrol_dashboard` still consumes the same
JSON shape. Any later Wi-Fi bridge or server-side tool should keep using that
same contract rather than changing the data model again.

## Directory Layout

```text
ws63e_env_patrol_car/
|-- app_main.c              # sample entry and task creation
|-- CMakeLists.txt          # source registration, Farsight sample style
|-- README.md               # HiSpark Studio usage and current stage
|-- ARCHITECTURE.md         # embedded architecture and development order
|-- board/
|   |-- car_board.h         # board pins, bus ids, device addresses
|   `-- car_board.c         # board initialization and hardware probing
|-- sensors/
|   |-- aht20.h/.c          # temperature and humidity
|   `-- bh1750.h/.c         # light intensity
|-- display/
|   `-- oled_status.h/.c    # local car display adapter
|-- motor/
|   `-- car_motor.h/.c      # exip06 I2C PWM bridge commands for L9110S
|-- patrol/
|   `-- patrol_route.h/.c   # timed open-loop route scripts
|-- comm/
|   `-- telemetry.h/.c      # serial telemetry and Web/server uplink seam
|-- drivers/
|   |-- i2c_bus.h           # narrow I2C wrapper used by all device drivers
|   `-- i2c_bus.c
`-- model/
    `-- env_data.h          # shared sensor/state data structure
```

Keep these folders small. Each module should expose a simple `init`, `read` or
`command` style interface and hide WS63 API details inside its own `.c` file.

## Data Flow

```text
I2C devices
  -> drivers/i2c_bus
  -> sensors/display modules
  -> app_main periodic tasks
  -> OLED local display
  -> I2C PWM bridge -> L9110S motor control
  -> Wi-Fi upload and manual-control service
  -> optional SLE bridge
```

The first successful milestone is I2C visibility, not full application behavior.
If a device does not ACK, fix wiring/address/power before adding its real driver.

## Module Responsibilities

- `app_main`: create RTOS tasks, start the current milestone, print high-level
  boot status.
- `board`: pinmux, bus configuration, known address table, hardware sanity logs.
- `drivers/i2c_bus`: only raw I2C init/read/write/probe helpers.
- `sensors`: convert device bytes to physical values.
- `display`: present local status on OLED; no business logic.
- `motor`: expose forward/back/left/right/stop/speed commands.
- `patrol`: timed motion sequence only. Do not claim precise positioning.
  Motor self-test is compile-time gated and disabled by default.
- `comm`: current car-side Wi-Fi/Web control entry. SLE remains the optional
  extension channel.
- `tools/env_patrol_dashboard`: local Web visualization and simple analysis for
  the emitted telemetry frames.

## Constraints

- Single-board only. Do not add a second WS63/base-station board.
- Do not use the buzzer.
- Do not add obstacle avoidance, encoder feedback, PID speed control, precise
  route tracking, line tracking, flame/gas sensors, or legacy board features unless hardware is
  later confirmed.
- Use 7-bit I2C addresses in code.
- Keep compilation selectable by `CONFIG_SAMPLE_SUPPORT_WS63E_ENV_PATROL_CAR`.

## Development Order

1. Build and flash the current embedded sample.
2. Confirm serial logs and ACK addresses.
3. Confirm AHT20/BH1750 values and OLED display.
4. Confirm L9110S motor direction with the car lifted off the ground.
5. Run the local dashboard against serial telemetry.
6. Verify the on-car Web page, `/api/data`, and `/api/control`.
7. Verify timed patrol scripts and alert flags on real hardware.
8. Add SLE exchange only after Wi-Fi and local control are stable.
