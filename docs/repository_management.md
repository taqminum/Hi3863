# Repository Management

This repository is managed as one monorepo with two firmware targets and one shared protocol/documentation layer.

## Firmware Boundaries

| Target | Path | Role | Port |
| --- | --- | --- | --- |
| WS63E car | `src/application/samples/Farsight/ws63e_env_patrol_car` | Vehicle controller, sensors, OLED, motors, SLE client, Wi-Fi fallback | COM6 |
| BearPi-Pico H3863 gateway source copy | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | Versioned source copy for review and handoff | COM5 |
| BearPi-Pico H3863 gateway build workspace | `G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway` | Actual VSCode/DevEco build target | COM5 |

The BearPi gateway directory may not exist in the initial commit. It should be created as a clean product directory derived from the official BearPi samples.

The BearPi firmware is not compiled from the car `src` workspace. Build and flash it separately from the official BearPi SDK workspace:

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
```

The repository copy under `vendor/BearPi-Pico_H3863` is used to keep the gateway source and documentation with the project. When code changes are made there, sync the product directory into the BearPi SDK workspace before using VSCode/DevEco to rebuild COM5 firmware.

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
