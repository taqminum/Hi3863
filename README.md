# WS63E Environment Patrol Car

This repository contains the firmware workspace and project documentation for a WS63E environment patrol car with a BearPi-Pico H3863 Wi-Fi/SLE gateway.

## Current Architecture

The final project architecture is:

```text
Phone App -> BearPi-Pico H3863 Wi-Fi gateway -> SLE -> WS63E car
WS63E car -> SLE telemetry -> BearPi gateway -> Wi-Fi -> Phone App
```

The WS63E car remains the only vehicle controller. It handles sensors, OLED display, motor control, safety stop logic, and fallback Wi-Fi HTTP control.

The BearPi-Pico H3863 is the wireless gateway. It should expose the phone App entry over Wi-Fi and forward commands to the car over SLE/StarFlash. It must not be wired into the car as a second vehicle controller.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/application/samples/Farsight/ws63e_env_patrol_car` | WS63E car firmware |
| `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | BearPi gateway firmware entry point |
| `vendor/BearPi-Pico_H3863/products/sle_uart` | BearPi official SLE UART reference sample |
| `vendor/BearPi-Pico_H3863/products/sle_gateway` | BearPi official SLE gateway reference sample |
| `vendor/BearPi-Pico_H3863/wifi` | BearPi Wi-Fi reference samples |
| `docs/ws63e_env_patrol_technical_chain.md` | Main technical chain and project plan |
| `docs/repository_management.md` | Repository management rules |

## Verified State

- The WS63E car can collect temperature, humidity, and light data.
- The OLED local display is working.
- Motor commands for forward, backward, left, right, and stop have been verified.
- The car Wi-Fi HTTP fallback path is working.
- The car SLE client can connect to BearPi `sle_uart_server`.
- BearPi can receive telemetry JSON from the car over SLE.
- BearPi serial commands can control the car over SLE.

## Firmware Boundaries

Manage this as one repository with two firmware targets:

| Target | Path | Port |
| --- | --- | --- |
| WS63E car | `src/application/samples/Farsight/ws63e_env_patrol_car` | COM6 |
| BearPi gateway | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | COM5 |

Do not mix the two firmware codebases. Shared behavior should be expressed through the documented command and telemetry protocol only.

## Main Protocol

Control command example:

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

Supported commands:

```text
forward
backward
left
right
stop
auto_start
auto_stop
```

Telemetry example:

```json
{"seq":1142,"temp_x10":304,"humi_x10":641,"light_x10":2958,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

## Build Notes

Car project entry:

```text
src/ws63e_env_patrol_car.hiproj
```

Known car build command:

```powershell
Set-Location src
python build.py ws63-liteos-app
```

BearPi gateway work should follow the official BearPi-Pico H3863 workflow and use `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` as the clean product directory.

## Documentation

Start here:

- `docs/ws63e_env_patrol_technical_chain.md`
- `docs/repository_management.md`
- `src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md`
- `src/application/samples/Farsight/ws63e_env_patrol_car/comm/PROTOCOL.md`
