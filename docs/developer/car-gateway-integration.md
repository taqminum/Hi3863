# 小车与星闪基站对接交接文档

本文档给固件侧同学使用。软件侧已经对齐小车差速协议：Web/APK 可以继续使用摇杆交互，进入小车或基站的最终 `payload` 会保留 `cmd=drive`、`left/right` 和 `duration_ms`。旧的方向命令仍保留用于兼容测试。

## 当前推荐链路

正式演示链路：

```text
APK/Web -> 云服务器 API -> 星闪基站 -> SLE -> WS63E 小车
WS63E 小车 -> SLE -> 星闪基站 -> 云服务器 API -> APK/Web
```

APK 还支持两条兜底链路：

```text
APK -> 星闪基站 Wi-Fi UDP -> SLE -> WS63E 小车
APK -> 小车 SoftAP HTTP -> WS63E 小车
```

默认先走云端；云端不可达时可以切到星闪基站 Wi-Fi；基站也不可达时再切到小车 SoftAP。小车 SoftAP 只作为调试和兜底，默认地址仍是 `http://192.168.5.1:8080`。

## 当前小车可直接执行的控制 payload

软件侧现在发送给基站队列、星闪基站 UDP 和本地小车调试链路的控制格式都是 JSON，正式摇杆控制以差速 `drive` 为主：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
{"cmd":"drive","left":0,"right":70,"duration_ms":350}
{"cmd":"drive","left":70,"right":70,"duration_ms":350}
{"cmd":"drive","left":-50,"right":-50,"duration_ms":350}
{"cmd":"stop","speed":0,"duration_ms":0}
{"cmd":"forward","speed":60,"duration_ms":350}
{"cmd":"backward","speed":40,"duration_ms":350}
{"cmd":"left","speed":50,"duration_ms":350}
{"cmd":"right","speed":50,"duration_ms":350}
{"cmd":"auto_start"}
{"cmd":"auto_stop"}
```

约束：

- `cmd`：正式控制使用 `drive/stop/auto_start/auto_stop`；`forward/backward/left/right` 仅作为旧命令兼容。
- `left/right`：差速左右轮百分比，范围 `-100..100`。
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
      "payload": "{\"cmd\":\"drive\",\"left\":70,\"right\":0,\"duration_ms\":350}",
      "status": "pulled",
      "created_at": "2026-07-08T10:00:00.000Z",
      "expires_at": "2026-07-08T10:00:02.000Z"
    }
  ]
}
```

说明：

- `action` 可能仍是 `drive`，表示来源是 APK 摇杆。
- `payload` 已经是当前小车可执行的差速 JSON，基站只需要原样通过 SLE 发给小车。
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

## 差速摇杆协议

云端会长期保存这些环境数据，APK 从云端拉取历史曲线。曲线严格按时间段展示：如果某段时间没有收到 telemetry，App 会让曲线断开，不会自动补线。

## APK 直连星闪基站 Wi-Fi UDP

当 APK 选择“星闪基站 Wi-Fi”时，软件侧已经实现 Android UDP 插件，会访问：

```text
udp://255.255.255.255:8888
```

手机发送：

```text
GET
```

基站返回当前遥测，推荐格式：

```json
{
  "seq": 42,
  "temp_x10": 253,
  "humi_x10": 618,
  "light_x10": 845,
  "motion": 1,
  "patrol": 0,
  "err": 0,
  "rssi": -48,
  "cached_count": 0
}
```

手机发送遥控时，UDP 内容就是当前小车可执行的 JSON：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":2200}
```

基站处理建议：

1. 收到 `GET` 时返回最近一次小车 SLE telemetry。
2. 收到 JSON 控制命令时，原样通过 SLE 发给小车。
3. 发送成功后返回最新 telemetry JSON，至少要包含 `seq/temp_x10/humi_x10/light_x10/motion/patrol/err`。
4. 附加 `rssi` 和 `cached_count`，用于 App 展示星闪链路质量和弱网缓存条数。
5. UDP 不适合长期历史，长期数据仍必须通过云端 telemetry 上传保存。

## App 历史 Agent 分析

APK 会把当前手机实际拿到的历史点和缺口区间发给云端：

```http
POST /api/agent/analyze-history
Authorization: Bearer <user-token>
Content-Type: application/json
```

固件侧不需要接入模型，也不要持有模型 API Key。Agent 只依赖 telemetry 的时间戳、温湿度、光照、RSSI 和缓存条数。缺数据的时间段由 App 识别并作为 `data_gap` 证据提交。

## 差速摇杆协议

小车当前支持 JSON 差速协议。继续使用 JSON，不使用旧的 `DRIVE:` 文本：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

固件侧要求：

1. 在 `control_command_parse()` 里优先识别 `cmd=drive`。
2. `left/right` 范围限制为 `-100..100`。
3. `duration_ms` 限制为 `0..3000`。
4. 电机层使用 `car_motor_drive(left_percent, right_percent, duration_ms)`。
5. 低占空比补偿放在电机层，不要改云端协议。
6. 保留超时停车保护。

软件侧已直接输出 `cmd=drive` JSON；基站和 PC bridge 只需要透传 `payload`。

## 固件侧验收建议

1. 基站轮询云端命令，确认收到的 `payload` 是 JSON 字符串。
2. 基站把 `payload` 原样通过 SLE 发给小车。
3. 小车串口确认收到 `drive/forward/left/right/stop` JSON 并执行。
4. APK 摇杆按住时，小车持续动作；松手后小车停止。
5. 基站回执 `executed` 后，APK/Web 命令历史从 `pulled` 变为 `executed`。
6. 基站上传 telemetry 后，APK 总览页温湿度、光照和 RSSI 曲线更新。
7. APK 切换到基站 Wi-Fi 后，UDP `GET` 能返回当前遥测，遥控 JSON 能通过 SLE 到达小车。

## 相关文件

- 小车控制协议实现参考：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/control_command.c`
- 小车 telemetry 实现参考：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/telemetry.c`
- 小车 HTTP fallback：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/wifi_ap.c`
- 基站 UDP/SLE 网关参考：`vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`
- 后端命令 payload：`apps/server/src/domain.ts`
- 后端命令队列：`apps/server/src/db.ts`
- APK/Web 协议映射：`apps/web/src/carProtocol.ts`
