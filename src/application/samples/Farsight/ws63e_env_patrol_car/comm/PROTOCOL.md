# Telemetry Protocol

The car firmware emits one JSON object per sample. Serial logs prefix the JSON
with `[car] telemetry ` so a terminal and the Web dashboard can both parse it.

```text
[car] telemetry {"seq":8,"temp_x10":286,"humi_x10":630,"light_x10":2466,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

## Fields

| Field | Unit | Meaning |
| --- | --- | --- |
| `seq` | count | Monotonic sample sequence from the firmware task. |
| `temp_x10` | 0.1 C | AHT20 temperature. |
| `humi_x10` | 0.1 %RH | AHT20 relative humidity. |
| `light_x10` | 0.1 lx | BH1750 light intensity. |
| `temp_alert` | bool | `1` when temperature crosses the configured high threshold. |
| `humi_alert` | bool | `1` when humidity crosses the configured high threshold. |
| `light_alert` | bool | `1` when light drops below the configured low threshold. |
| `motion` | enum | `0` stop, `1` forward, `2` backward, `3` left, `4` right. |
| `patrol` | bool | Timed open-loop patrol route flag. |
| `err` | code | Last sensor or board error code, `0` for normal. |

## Transport Plan

Current milestone:

- Firmware prints serial JSON.
- `tools/env_patrol_dashboard` reads the same JSON from a serial log or HTTP
  POST.

Next milestone:

- Wi-Fi upload should send this exact JSON object to `/api/telemetry`.
- Manual Web control should use short motion commands, then map them to
  `car_motor_command`.
- SLE exchange can forward the same JSON payload for short-range data sharing.

Do not add line-tracking, buzzer, obstacle avoidance, or precise navigation
fields unless the hardware is later confirmed.
