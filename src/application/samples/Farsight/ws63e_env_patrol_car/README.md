# WS63E Env Patrol Car Sample

This sample is the embedded entry for the single-board WS63E patrol car plan.
It follows the existing `application/samples/Farsight` sample style: one Kconfig
switch selects one sample directory, and the directory contributes source files
to the shared `samples` component.

The current project-level technical chain and feature boundary are documented
in `G:\fbb_ws63_20260226\docs\ws63e_env_patrol_technical_chain.md`.

## HiSpark Studio Entry

- Open project: `G:\fbb_ws63_20260226\src\ws63e_env_patrol_car.hiproj`
- Build target: `WS63-LITEOS-APP`
- Build command behind the target: `ws63-liteos-app`
- Firmware package after a successful build:
  `G:\fbb_ws63_20260226\src\output\ws63\fwpkg\ws63-liteos-app\ws63-liteos-app_all.fwpkg`
- Serial monitor baud rate: `115200`

Do not use `demo.hiproj` for this workspace. It still records an old SDK path.

## Current Stage

The current embedded goal is:

1. Boot the selected sample.
2. Initialize the WS63E car I2C bus.
3. Probe known onboard I2C devices and print results.
4. Read AHT20 and BH1750 through focused drivers.
5. Render the latest state to OLED.
6. Keep the motor stopped by default and expose a timed route module.
7. Print telemetry frames for the later Web/server side.

Current firmware also provides:

- SoftAP: `WS63E_ENV_CAR`
- Password: `12345678`
- Local root page: `http://192.168.5.1:8080/`
- Telemetry API: `GET /api/data`
- Manual control API: `POST /api/control`
- Preset route control: `{"cmd":"auto_start"}` and `{"cmd":"auto_stop"}`
- Lightweight analysis flags: `temp_alert`, `humi_alert`, `light_alert`

The main loop uses a 100 Hz LiteOS/CMSIS tick assumption, so the 1000 ms sample
period is delayed as 100 ticks.

## Motor Direction Check

The motor path initializes the wheel PWM bridge from
`D:\fbb_ws63\src\application\samples\peripheral\exip06`, then drives the
L9110S motor driver. It does not move by default.

For a one-time direction check, lift the car off the ground, then temporarily
set this macro in `app_main.c`:

```c
#define ENV_PATROL_MOTOR_SELF_TEST_ON_BOOT 1
```

Rebuild and flash. Expected serial logs:

```text
[car] motor self-test begin; keep the car lifted
[car] motor cmd addr=0x5A motion=1 speed=50 duty=500 ...
[car] motor cmd addr=0x5A motion=2 speed=50 duty=500 ...
[car] motor cmd addr=0x5A motion=3 speed=50 duty=500 ...
[car] motor cmd addr=0x5A motion=4 speed=50 duty=500 ...
[car] motor self-test end
```

The default value in the current project is `0`, so the car stays still after
power-on. After confirming wheel directions, set the macro back to `0`. The
project does not use line tracking or obstacle avoidance, so motion is open-loop.

After this passes on hardware, continue in this order:

1. Verify I2C ACKs and serial logs.
2. Verify AHT20 and BH1750 numeric values.
3. Verify OLED text orientation and readability.
4. Confirm L9110S motor direction with the car lifted off the ground.
5. Run the local Web dashboard from `tools/env_patrol_dashboard`.
6. Enable manual Web/server command parsing.
7. Enable timed patrol route only after motor direction is confirmed.
8. Add optional SLE short-range data exchange.

## Hardware Boundaries

- Final architecture is single-board: WS63E car board only.
- I2C bus: `I2C_BUS_1`
- SCL: `GPIO_15`, SDA: `GPIO_16`
- Pin mode: `2`
- I2C speed: `100000`
- I2C master code: `0`
- WS63 I2C APIs use 7-bit device addresses.
- PCA9555 follows the `she_docs/io_expander.h` value `0x28`; current hardware
  logs ACK `0x28` and NACK the schematic-style `0x14` probe.
- Motor control first checks the `exip06` wheel PWM address `0x5A`, then keeps
  `0x15` and `0x2A` only as legacy probes for comparison.
- Buzzer is physically unavailable and must not be used.
- The car has no line-tracking module; patrol means manual remote inspection or
  later timed open-loop movement, not line following.
- Route patrol is timed open-loop unless extra positioning/encoder hardware is
  later confirmed.

## Local Web Visualization

The current embedded sample prints telemetry frames first. The local Web side
can consume those frames before the Wi-Fi uplink is finished:

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --demo
```

Open `http://127.0.0.1:8763`.

To connect real serial output, save/capture serial lines into a log file and
run:

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --log-file G:\fbb_ws63_20260226\logs\car_serial.log
```

The accepted line format is the same as the firmware log:

```text
[car] telemetry {"seq":8,"temp_x10":286,"humi_x10":630,"light_x10":2466,"motion":0,"patrol":0,"err":0}
```

The field contract is in `comm/PROTOCOL.md`. Keep Wi-Fi, Web and optional SLE on
that same JSON shape.

## On-Car Web Control

After flashing the current firmware:

1. Connect a phone or laptop to `WS63E_ENV_CAR`
2. Open `http://192.168.5.1:8080/`
3. Confirm the page shows temperature, humidity, light, sequence and analysis
4. Test:
   - `Forward / Backward / Left / Right / Stop`
   - `Auto Start / Auto Stop`

Notes:

- Some phones will try to switch away from the AP because it has no Internet.
  Disable mobile data assist or temporarily turn off cellular data while
  testing.
- Manual commands stop the preset timed route first, then apply the requested
  motion.
- If alerts are active, OLED shows `ALERT` and Web shows `TEMP`, `HUMI`,
  `LIGHT`, or a combined label.
- The on-car page also shows recent trend badges when the last few samples
  change enough to cross the local Web analysis thresholds.
- A Windows helper script is available at:
  `G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1`

## Expected Boot Log

```text
ws63e env patrol car boot
[car] board init: i2c bus=1 scl=gpio15 sda=gpio16 mode=2 baud=100000
[car] i2c init OK; APIs expect 7-bit device addresses
[car] i2c probe begin
[car] probe 0x23 BH1750 light ...
[car] probe 0x38 AHT20 temp/humi ...
[car] probe 0x3C SSD1306 OLED ...
[car] probe 0x28 PCA9555 IO ...
[car] probe 0x14 PCA9555 schematic probe ...
[car] probe 0x5A wheel PWM bridge ...
[car] probe 0x15 STM8S legacy probe ...
[car] probe 0x2A STM8S compat probe ...
[car] probe 0x62 CW2015 battery ...
[car] i2c probe end
[car] AHT20 init ret=...
[car] BH1750 init ret=...
[car] OLED init via she_docs SSD1306 driver
[car] motor init via exip06/she_docs PWM bridge to L9110S addr=0x5A ret=0x0
[car] wifi ap ready ssid=WS63E_ENV_CAR ip=192.168.5.1
[car] wifi http ready url=http://192.168.5.1:8080/api/data
[car] telemetry {"seq":...}
```
