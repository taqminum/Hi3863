# Repository Management

This repository is managed as one monorepo with two firmware targets and one shared protocol/documentation layer.

## Firmware Boundaries

| Target | Path | Role | Port |
| --- | --- | --- | --- |
| WS63E car | `src/application/samples/Farsight/ws63e_env_patrol_car` | Vehicle controller, sensors, OLED, motors, SLE client, Wi-Fi fallback | COM6 |
| BearPi-Pico H3863 gateway | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | Wi-Fi gateway, SLE server, phone App entry | COM5 |

The BearPi gateway directory may not exist in the initial commit. It should be created as a clean product directory derived from the official BearPi samples.

## Reference Samples

Keep these directories as references and fallback baselines:

```text
vendor/BearPi-Pico_H3863/products/sle_uart
vendor/BearPi-Pico_H3863/products/sle_gateway
vendor/BearPi-Pico_H3863/products/ble_uart
vendor/BearPi-Pico_H3863/wifi/softap_sample
vendor/BearPi-Pico_H3863/wifi/udp_client
```

Do not turn those original samples into the final product code. Create or update:

```text
vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
```

## Shared Contract

The car and BearPi firmware should share only the documented communication contract:

- control JSON
- bare text debug commands
- telemetry JSON
- SLE target name: `sle_uart_server`

Do not copy car business logic into the BearPi firmware, and do not copy BearPi gateway logic into the car firmware.

## Clean Repository Rules

Commit source code, configuration, protocol docs, project docs, and useful official samples.

Do not commit:

- firmware build outputs
- generated analyzer JSON
- local logs
- assistant/cache folders
- bundled compiler binaries restored by HiSpark Studio or vendor tooling

The `.gitignore` at the repository root encodes these rules.

## Recommended Branches

Use one repository with feature branches instead of two separate repositories:

- `main`: stable integrated project state
- `car/*`: car firmware changes
- `bearpi/*`: BearPi gateway changes
- `docs/*`: architecture, protocol, and presentation docs

This keeps the phone App protocol and the two firmware targets versioned together.
