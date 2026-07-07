# 小车与星闪基站对接交接文档

本文档给固件侧同学使用。当前仓库的软件侧已经完成 Web/APK、云端 API、命令队列、遥测入库和基础 Agent 分析；小车固件和基站固件由固件侧继续对接。软件侧不会直接改小车代码。

## 目标链路

正式演示链路：

```text
Web/APK -> 云服务器 API -> 星闪基站 -> SLE -> 小车
小车 -> SLE -> 星闪基站 -> 云服务器 API -> Web/APK
```

Web/APK 不直接依赖小车局域网。仓库中保留本地 SoftAP 模式，只作为小车单机调试和验收备用。

## 固件侧需要实现的内容

固件侧优先完成 4 件事：

1. 基站能轮询云端命令：`GET /api/base-stations/sle-base-001/commands/pending`。
2. 基站能把命令 `payload` 通过 SLE 发给小车。
3. 小车能解析并执行 `DRIVE:left:right:duration`。
4. 基站能上传小车 telemetry，并回执命令状态。

## 云端命令拉取

基站请求：

```http
GET /api/base-stations/sle-base-001/commands/pending
X-Device-Key: <DEVICE_INGEST_KEY>
```

返回：

```json
{
  "commands": [
    {
      "id": "cmd-1720000000000-abcd",
      "device_id": "ws63-car-001",
      "base_station_id": "sle-base-001",
      "action": "drive",
      "speed": 0,
      "payload": "DRIVE:70:0:350",
      "status": "pulled",
      "created_at": "2026-07-07T10:00:00.000Z",
      "expires_at": "2026-07-07T10:00:02.000Z"
    }
  ]
}
```

基站只需要关注：

- `id`：后续回执用。
- `payload`：原样通过 SLE 发给小车。
- `expires_at`：如果基站本地判断命令已过期，可以丢弃，不再发给小车。

## 小车控制 payload

旧协议继续支持：

```text
FORWARD:<speed>
BACKWARD:<speed>
STOP:0
```

新增摇杆协议：

```text
DRIVE:<left_percent>:<right_percent>:<duration_ms>
```

含义：

- `left_percent`：左轮输出，范围 `-100..100`。正数前进，负数后退。
- `right_percent`：右轮输出，范围 `-100..100`。正数前进，负数后退。
- `duration_ms`：命令保持时间，范围 `0..3000`。Web/APK 当前默认 `350ms`。

示例：

```text
DRIVE:70:70:350    # 直行前进
DRIVE:-50:-50:350  # 后退
DRIVE:70:0:350     # 右转弧线
DRIVE:0:70:350     # 左转弧线
DRIVE:70:-70:350   # 原地右转
STOP:0             # 停车
```

建议小车固件实现：

1. 在现有 `control_command_parse()` 中优先判断 `DRIVE:` 前缀。
2. 解析方式可用：`sscanf(payload, "DRIVE:%d:%d:%u", &left, &right, &duration_ms)`。
3. 对 `left/right` 做 `-100..100` 限幅，对 `duration_ms` 做 `0..3000` 限幅。
4. 新增电机层接口，例如：`car_motor_drive(int left_percent, int right_percent, uint32_t duration_ms)`。
5. 左右轮符号决定方向，绝对值决定 PWM 占空比。
6. 如果电机低占空比无法启动，在电机层做最小有效占空比补偿，不要改云端协议。
7. 加超时保护：超过 `duration_ms + 200ms` 未收到新命令时自动停车。

## 队列规则

软件侧已经做了队列保护：

- `drive` 命令有效期约 `2s`，过期不会再被基站拉取。
- 新的 `drive` 会取消同一小车同一基站的旧 `drive`，避免摇杆拖动产生命令堆积。
- `stop` 会取消旧 `drive`，并且自身会保留，保证松手停车优先。
- 基站仍建议自己做一次本地超时保护，防止网络断开时小车继续运动。

## 命令回执

小车执行后，基站回执云端：

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

`status` 可选值：

- `sent`：基站已经发给小车。
- `executed`：小车确认执行。
- `failed`：发送或执行失败。

如果当前固件链路暂时不方便做小车确认，可以先在基站发出 SLE 数据后回 `executed`，后续再拆成 `sent/executed` 两段。

## telemetry 上传

基站上传小车环境数据：

```http
POST /api/ingest/base-stations/sle-base-001/telemetry
X-Device-Key: <DEVICE_INGEST_KEY>
Content-Type: application/json
```

```json
{
  "batchId": "sle-base-001-1001",
  "sequence": 1001,
  "receivedAt": "2026-07-07T10:00:00.000Z",
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
      "lightness": 2466,
      "gear": "M",
      "direction": "forward",
      "status": "moving"
    }
  ]
}
```

注意：

- `batchId` 用于云端去重，建议格式为 `<baseStationId>-<sequence>`。
- `temperature/humidity/lightness` 使用真实单位，不要上传小车内部的 x10 编码。
- `cachedCount` 是基站弱网缓存条数，Web 总览页会展示。
- `rssi` 是小车到基站 SLE 链路 RSSI，低于 `-75 dBm` 时 Agent 会提示风险。

## 本地 SoftAP 兼容

Web/APK 本地模式默认访问：`http://192.168.5.1:8080`。

前端会优先发送新 JSON：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

如果小车当前固件不支持，会降级发送旧 JSON：

```json
{"cmd":"right","speed":50,"duration_ms":350}
```

Android APK 已允许访问 `http://192.168.5.1` 明文 HTTP。云端 API 仍使用 HTTPS。

## 固件侧验收建议

1. 小车离地测试电机方向，确认 `DRIVE:70:70:350` 是前进。
2. 测试 `DRIVE:70:-70:350` 和 `DRIVE:-70:70:350` 是否分别原地左右转。
3. 测试 `STOP:0` 和命令超时保护是否能停车。
4. 基站轮询云端命令，确认能收到 `DRIVE` payload。
5. 基站回执 `executed`，Web/APK 命令历史应从 `pulled` 变为 `executed`。
6. 基站上传 telemetry，Web/APK 总览页应更新温湿度、光照曲线和 RSSI。

## 相关文件

- 软件侧正式 API 文档：`deploy/base-station-api.md`
- Web/APK 控制协议：`apps/web/src/carProtocol.ts`
- 云端命令队列：`apps/server/src/db.ts`
- 云端命令 API：`apps/server/src/http.ts`
- 小车当前参考代码：`src/application/samples/Farsight/ws63e_env_patrol_car`
