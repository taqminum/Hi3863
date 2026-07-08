# Control Command Protocol

Manual control commands use a small JSON object. This protocol is shared by the
local Web dashboard, future Wi-Fi command receive path, and optional SLE control
extension.

```json
{"cmd":"forward","speed":35,"duration_ms":600}
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

## Fields

| Field | Values | Meaning |
| --- | --- | --- |
| `cmd` | `stop`, `forward`, `backward`, `left`, `right`, `drive` | L9110S motion command. |
| `speed` | `0` to `100` | Open-loop PWM percentage. |
| `left` | `-100` to `100` | Left wheel open-loop percentage for `drive`. |
| `right` | `-100` to `100` | Right wheel open-loop percentage for `drive`. |
| `duration_ms` | `0` to `3000` | Safety-bounded command duration. |

Preset timed patrol uses the same endpoint with:

```json
{"cmd":"auto_start"}
```

or

```json
{"cmd":"auto_stop"}
```

Manual commands stop the preset patrol first, then apply the requested motion.

Current firmware exposes `control_command_parse` and `control_command_apply`.
The command receive transport is intentionally separate so serial, Wi-Fi, Web
or SLE can feed the same parser later.

Current car-side HTTP control endpoint is:

```http
POST /api/control
Content-Type: application/json
```

The root page at `/` sends this JSON body directly and polls `GET /api/data`
once per second for live telemetry.

## Phone App Control Contract

The phone app should control the car over the car's SoftAP HTTP endpoint. It is
not part of the BearPi-Pico H3863 SLE extension path.

Connection:

- Wi-Fi SSID: `WS63E_ENV_CAR`
- Wi-Fi password: `12345678`
- Base URL: `http://192.168.5.1:8080`

Recommended app behavior:

- Poll telemetry with `GET /api/data` about once per second.
- On joystick move, send `POST /api/control` with `cmd=drive`, `left`, `right`
  and `duration_ms`.
- While a direction button is held, repeat the same command every 300 to 500 ms.
- On button release, immediately send `{"cmd":"stop"}`.
- Use `auto_start` and `auto_stop` only for the preset open-loop patrol route.
- Any manual command stops the preset patrol before applying the manual motion.

Safety note:

- The firmware has an 800 ms manual-command watchdog. If the app stops sending
  manual motion commands, the car should stop automatically.
- Phones may switch away from the car's Wi-Fi because the SoftAP has no
  Internet. During tests, keep the app bound to the `WS63E_ENV_CAR` network or
  disable cellular/smart network switching.

The car has no line-tracking module. Do not add line-following commands.
