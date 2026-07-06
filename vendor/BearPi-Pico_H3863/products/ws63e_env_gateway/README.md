# WS63E Environment Gateway for BearPi-Pico H3863

This directory is reserved for the BearPi-Pico H3863 gateway firmware.

## Role

The BearPi board is the Wi-Fi gateway and SLE server in the final project architecture:

```text
Phone App -> BearPi Wi-Fi gateway -> SLE -> WS63E car
WS63E car -> SLE telemetry -> BearPi gateway -> Wi-Fi -> Phone App
```

## Boundaries

- Keep the car firmware in `src/application/samples/Farsight/ws63e_env_patrol_car`.
- Keep this directory for BearPi gateway firmware only.
- Do not modify the original official samples as final product code.
- Use `products/sle_uart`, `products/sle_gateway`, `wifi/softap_sample`, and `wifi/udp_client` as references.

## Planned Interfaces

Wi-Fi AP:

```text
SSID: WS63E_ENV_GATEWAY
Password: 12345678
```

SLE target name:

```text
sle_uart_server
```

Suggested App APIs:

```http
GET /api/data
POST /api/control
GET /api/status
```

## First Implementation Target

1. Start from the official BearPi SLE UART server or SLE gateway sample.
2. Preserve the SLE server name `sle_uart_server`.
3. Add Wi-Fi AP and an HTTP or UDP command ingress.
4. Forward App commands to the WS63E car over SLE.
5. Cache the latest telemetry JSON received from the car.
6. Expose the latest telemetry to the App over Wi-Fi.
