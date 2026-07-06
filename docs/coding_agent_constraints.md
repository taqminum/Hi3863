# Coding Agent Constraints

This document is the handoff contract for any coding agent that implements the next stage of this project.

## Mission

Implement the BearPi-Pico H3863 Wi-Fi + SLE gateway as the main phone App entry for the WS63E environment patrol car.

Final communication path:

```text
Phone App -> BearPi-Pico H3863 Wi-Fi gateway -> SLE -> WS63E car
WS63E car -> SLE telemetry -> BearPi gateway -> Wi-Fi -> Phone App
```

The goal is not to redesign the car. The goal is to add a clean BearPi gateway while preserving the already tested car firmware.

## Repository Model

This is one repository with two firmware targets:

| Target | Directory | Role | Serial |
| --- | --- | --- | --- |
| WS63E car | `src/application/samples/Farsight/ws63e_env_patrol_car` | Vehicle controller, sensors, OLED, motors, SLE Client, Wi-Fi fallback | COM6 |
| BearPi gateway | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | Wi-Fi AP/gateway, SLE Server, phone App entry | COM5 |

Do not create a second repository. Do not merge the two firmware projects into one directory.

## Hard Directory Rules

Allowed primary implementation directory:

```text
vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
```

Allowed car-side directory only if a minimal compatibility fix is truly required:

```text
src/application/samples/Farsight/ws63e_env_patrol_car
```

Reference-only directories:

```text
vendor/BearPi-Pico_H3863/products/sle_uart
vendor/BearPi-Pico_H3863/products/sle_gateway
vendor/BearPi-Pico_H3863/products/ble_uart
vendor/BearPi-Pico_H3863/wifi/softap_sample
vendor/BearPi-Pico_H3863/wifi/udp_client
```

Do not turn the reference sample directories into the final product code. Copy or adapt the minimum required pieces into `ws63e_env_gateway` and keep the originals usable as fallback references.

Do not edit, commit, or depend on generated output directories:

```text
src/output
src/analyzerJson
src/interim_binary
logs
```

Do not commit local IDE/cache/assistant state.

## Hardware Truths

The WS63E car:

- Has working AHT20 temperature/humidity sensing.
- Has working BH1750 light sensing.
- Has working SSD1306 OLED display.
- Has working I2C motor control at address `0x5A`.
- Can move forward, backward, left, right, and stop.
- Has tested SLE Client code that connects to `sle_uart_server`.
- Has Wi-Fi HTTP fallback control already working.

The BearPi-Pico H3863:

- Is a small Wi-Fi/SLE/BLE-capable board.
- Must not be physically wired into the car as a second controller.
- Must not be responsible for car sensors, OLED, motors, or battery wiring.
- Should be treated as a wireless gateway only.

Do not claim or implement unsupported features such as line tracking, obstacle avoidance, precise navigation, closed-loop path planning, or buzzer alerts.

## Architecture Constraints

Keep SLE roles unchanged:

```text
BearPi-Pico H3863: SLE Server
WS63E car: SLE Client
SLE advertised name: sle_uart_server
```

Reason: this role split has already been tested successfully. Do not reverse SLE roles unless explicitly instructed by the project owner.

Keep the car Wi-Fi HTTP path as fallback/debug. It is not the final App main path.

The BearPi gateway must provide the final App main path:

```text
Phone App -> BearPi Wi-Fi -> BearPi SLE write -> car control parser
car telemetry JSON -> SLE -> BearPi cache -> Phone App
```

## BearPi Gateway Requirements

The first useful gateway version must:

1. Build inside `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`.
2. Start from the official BearPi workflow and sample structure.
3. Preserve SLE Server advertising name `sle_uart_server`.
4. Accept car SLE Client connection.
5. Receive telemetry JSON from the car over SLE.
6. Cache the latest telemetry frame.
7. Start a Wi-Fi AP for the phone App.
8. Accept App control commands over Wi-Fi.
9. Forward App commands to the car over SLE.
10. Provide serial logs on COM5 for Wi-Fi state, SLE connection state, received App commands, forwarded SLE commands, and latest telemetry.

Recommended BearPi Wi-Fi AP:

```text
SSID: WS63E_ENV_GATEWAY
Password: 12345678
```

Recommended HTTP API, if HTTP is practical in the BearPi environment:

```http
GET /api/data
POST /api/control
GET /api/status
```

If HTTP is too slow to integrate in the first pass, UDP is acceptable as the first gateway transport. The code and README must clearly document the chosen transport, IP, port, message format, and test command.

## Protocol Contract

Use the existing command vocabulary.

JSON command example:

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

Bare text command examples:

```text
forward
backward
left
right
stop
auto_start
auto_stop
```

Telemetry JSON example:

```json
{"seq":1142,"temp_x10":304,"humi_x10":641,"light_x10":2958,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

Do not invent a second App protocol if the existing car control parser can already consume the command. Normalize at the BearPi gateway only when needed.

## Car Firmware Constraints

The car firmware is already tested. Avoid touching it unless necessary.

If car-side edits are required:

- Keep them small.
- Preserve SLE Client behavior.
- Preserve Wi-Fi HTTP fallback behavior.
- Preserve motor safety timeout and short movement behavior.
- Preserve `stop` as the highest-priority command.
- Do not remove telemetry fields.
- Do not change command names without updating all protocol docs.

Known car build entry:

```text
src/ws63e_env_patrol_car.hiproj
```

Known car build command:

```powershell
Set-Location src
python build.py ws63-liteos-app
```

## README Requirements

The BearPi gateway directory must maintain its own README:

```text
vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/README.md
```

That README must include:

- Build workflow.
- KConfig selection path or build option.
- Flash/upload serial port: COM5.
- Wi-Fi SSID/password.
- HTTP routes or UDP port.
- SLE advertised name.
- Test steps.
- Expected serial logs.
- Known limitations.

If the implementation chooses UDP before HTTP, the README must say so clearly.

## Verification Checklist

Before claiming completion, verify and report the result of each applicable item:

1. BearPi gateway builds.
2. BearPi gateway flashes to COM5.
3. BearPi starts Wi-Fi AP.
4. Phone or PC can connect to BearPi AP.
5. BearPi starts SLE Server as `sle_uart_server`.
6. WS63E car connects as SLE Client.
7. BearPi receives car telemetry JSON over SLE.
8. App/PC sends `forward` through BearPi Wi-Fi.
9. BearPi forwards `forward` over SLE.
10. Car logs show `[car][sle] rx forward` or equivalent.
11. Car moves forward briefly.
12. App/PC sends `stop`.
13. Car stops.
14. Latest telemetry can be read back through BearPi Wi-Fi.

If any item cannot be verified because hardware is unavailable, state that explicitly and provide the exact command or test step the project owner should run.

## Non-Goals

Do not implement these in the gateway task:

- BLE phone control as the main path.
- Cloud/MQTT integration.
- New sensors.
- Physical wiring between BearPi and the car.
- Autonomous navigation.
- Line tracking.
- Obstacle avoidance.
- Battery/power redesign.
- Major car firmware rewrite.

BLE may remain a future optional enhancement only after the Wi-Fi + SLE gateway is stable.

## Commit Hygiene

Keep commits scoped:

- `bearpi/*` branch for BearPi gateway implementation.
- `car/*` branch only for car-side fixes.
- `docs/*` branch for documentation-only changes.

Do not commit build outputs, local logs, or generated firmware packages.

Before final handoff, include:

- Summary of changed files.
- Build command used.
- Flash command or HiSpark Studio workflow used.
- Verification results.
- Any hardware steps the project owner must perform.
