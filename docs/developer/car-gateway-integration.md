# 小车与星闪基站对接交接文档

本文档给固件侧同学使用。软件侧已经对齐当前小车固件协议：Web/APK 可以继续使用摇杆交互，但进入小车或基站的最终 `payload` 会降级为当前小车能解析的 JSON 方向命令。固件侧暂时不用为了本次联调立刻实现差速 `drive(left,right)`，后续如果时间充足再扩展。

## 当前推荐链路

正式演示链路：

```text
APK/Web -> 云服务器 API -> 星闪基站 -> SLE -> WS63E 小车
WS63E 小车 -> SLE -> 星闪基站 -> 云服务器 API -> APK/Web
```

本地调试链路：

```text
APK/Web -> 小车 SoftAP HTTP -> WS63E 小车
```

小车 SoftAP 只作为调试和兜底，默认地址仍是 `http://192.168.5.1:8080`。

## 当前小车可直接执行的控制 payload

软件侧现在发送给基站队列和本地小车 HTTP 的控制格式都是 JSON：

```json
{"cmd":"forward","speed":60,"duration_ms":350}
{"cmd":"backward","speed":40,"duration_ms":350}
{"cmd":"left","speed":50,"duration_ms":350}
{"cmd":"right","speed":50,"duration_ms":350}
{"cmd":"stop","speed":0,"duration_ms":0}
{"cmd":"auto_start"}
{"cmd":"auto_stop"}
```

约束：

- `cmd`：`forward/backward/left/right/stop/auto_start/auto_stop`
- `speed`：`0..100`
- `duration_ms`：`0..3000`
- APK 摇杆按住时约每 `300ms` 续发一次命令。
- 小车当前 `800ms` 手动控制看门狗可以继续保留。
- 松手、页面失焦或离开控制页时，APK 会发送 `stop`。

## 云端命令拉取

基站轮询：

```http
GET /api/base-stations/sle-base-001/commands/pending
X-Device-Key: <DEVICE_INGEST_KEY>
```

返回示例：

```json
{
  "commands": [
    {
      "id": "cmd-1783480000000-abcd",
      "device_id": "ws63-car-001",
      "base_station_id": "sle-base-001",
      "action": "drive",
      "speed": 0,
      "payload": "{\"cmd\":\"right\",\"speed\":70,\"duration_ms\":350}",
      "status": "pulled",
      "created_at": "2026-07-08T10:00:00.000Z",
      "expires_at": "2026-07-08T10:00:02.000Z"
    }
  ]
}
```

说明：

- `action` 可能仍是 `drive`，表示来源是 APK 摇杆。
- `payload` 已经是当前小车可执行的 JSON，基站只需要原样通过 SLE 发给小车。
- `drive` 命令有效期约 `2s`，过期后不会再被基站拉取。
- 新的 `drive` 会取消同一设备同一基站的旧 `drive`，避免摇杆拖动堆积。
- `stop` 会取消旧 `drive` 并保留自身，保证松手停车优先。

## 命令回执

基站发送给小车后回执云端：

```http
PATCH /api/commands/<commandId>/ack
X-Device-Key: <DEVICE_INGEST_KEY>
Content-Type: application/json

{"status":"executed"}
```

失败时：

```json
{"status":"failed","errorMessage":"SLE timeout"}
```

`status` 可选：

- `sent`：基站已经发给小车。
- `executed`：小车确认执行，或当前阶段基站已经成功发出 SLE 数据。
- `failed`：基站发送失败、小车未连接或 SLE 超时。

如果当前小车侧没有确认机制，基站可以先在 SLE 发送成功后直接回 `executed`。

## telemetry 上传

云端现在同时支持两种 telemetry 格式。

推荐基站上传平台格式：

```json
{
  "batchId": "sle-base-001-1001",
  "sequence": 1001,
  "receivedAt": "2026-07-08T10:00:00.000Z",
  "link": {
    "rssi": -48,
    "cachedCount": 0,
    "mode": "sle"
  },
  "devices": [
    {
      "deviceId": "ws63-car-001",
      "temperature": 28.6,
      "humidity": 63.0,
      "lightness": 246,
      "gear": "M",
      "direction": "forward",
      "status": "moving"
    }
  ]
}
```

也兼容当前小车原始 JSON：

```json
{
  "seq": 42,
  "temp_x10": 253,
  "humi_x10": 618,
  "light_x10": 845,
  "temp_alert": 0,
  "humi_alert": 0,
  "light_alert": 0,
  "motion": 1,
  "patrol": 0,
  "err": 0
}
```

云端会把原始 JSON 归一化为：

- `temp_x10 / 10 -> temperature`
- `humi_x10 / 10 -> humidity`
- `light_x10 / 10 -> lightness`
- `motion`: `0 stop`, `1 forward`, `2 backward`, `3 left`, `4 right`
- `patrol=1 -> gear=AUTO`
- `err != 0 -> status=fault`

上传接口：

```http
POST /api/ingest/base-stations/sle-base-001/telemetry
X-Device-Key: <DEVICE_INGEST_KEY>
Content-Type: application/json
```

## 未来差速摇杆扩展

如果后续要让小车支持更细的转向幅度，建议新增 JSON 协议，而不是使用旧的 `DRIVE:` 文本：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

固件侧建议：

1. 在 `control_command_parse()` 里优先识别 `cmd=drive`。
2. `left/right` 范围限制为 `-100..100`。
3. `duration_ms` 限制为 `0..3000`。
4. 新增电机层接口，例如 `car_motor_drive(left_percent, right_percent, duration_ms)`。
5. 低占空比补偿放在电机层，不要改云端协议。
6. 保留超时停车保护。

软件侧已经保留 `left/right/durationMs` 输入字段，等小车支持 `cmd=drive` 后，只需要把后端 `toCarControlPayload()` 切换到直接输出 drive JSON。

## 固件侧验收建议

1. 基站轮询云端命令，确认收到的 `payload` 是 JSON 字符串。
2. 基站把 `payload` 原样通过 SLE 发给小车。
3. 小车串口确认收到 `forward/left/right/stop` JSON 并执行。
4. APK 摇杆按住时，小车持续动作；松手后小车停止。
5. 基站回执 `executed` 后，APK/Web 命令历史从 `pulled` 变为 `executed`。
6. 基站上传 telemetry 后，APK 总览页温湿度、光照和 RSSI 曲线更新。

## 相关文件

- 小车控制协议实现参考：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/control_command.c`
- 小车 telemetry 实现参考：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/telemetry.c`
- 小车 HTTP fallback：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/wifi_ap.c`
- 基站 UDP/SLE 网关参考：`vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`
- 后端命令 payload：`apps/server/src/domain.ts`
- 后端命令队列：`apps/server/src/db.ts`
- APK/Web 协议映射：`apps/web/src/carProtocol.ts`
