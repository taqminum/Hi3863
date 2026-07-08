# 星闪基站接入 API

基站通过 SLE 与小车交换数据，通过云端 API 与 Web/APK 平台同步。Web/APK 默认只连接云服务器；小车 SoftAP HTTP 只作为调试和兜底链路。

## 基础信息

- 云端 API：`https://rxcccccc.icu/ws63-api`
- 本地调试：`http://127.0.0.1:8787`
- 鉴权请求头：`X-Device-Key: <DEVICE_INGEST_KEY>`
- 默认基站：`sle-base-001`
- 默认小车：`ws63-car-001`

`DEVICE_INGEST_KEY` 只保存在云端 `.env` 和本地交付说明中，不写入源码。

## 上传 telemetry

推荐上传平台格式：

```bash
curl -X POST https://rxcccccc.icu/ws63-api/api/ingest/base-stations/sle-base-001/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"batchId":"sle-base-001-1001","sequence":1001,"link":{"rssi":-52,"cachedCount":0,"mode":"sle"},"devices":[{"deviceId":"ws63-car-001","temperature":24.5,"humidity":53.2,"lightness":900,"gear":"M","direction":"forward","status":"moving"}]}'
```

也兼容当前小车原始 JSON：

```bash
curl -X POST https://rxcccccc.icu/ws63-api/api/ingest/base-stations/sle-base-001/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"seq":42,"temp_x10":253,"humi_x10":618,"light_x10":845,"motion":1,"patrol":0,"err":0}'
```

字段说明：

- `batchId`：幂等去重 ID。基站重试同一批数据时保持相同 `batchId`。
- `link.rssi`：小车与基站的 SLE RSSI。
- `link.cachedCount`：基站弱网缓存条数。
- `temperature/humidity/lightness`：真实单位。
- `temp_x10/humi_x10/light_x10`：小车原始格式，云端会自动除以 10。
- `direction` 或 `motion`：`stop/forward/backward/left/right`。
- `status`：`idle/moving/fault/offline`。

首次写入返回 `201`；重复 `batchId` 返回 `200` 和 `duplicate: true`。

## 拉取待执行命令

```bash
curl https://rxcccccc.icu/ws63-api/api/base-stations/sle-base-001/commands/pending \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>"
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

基站只需要把 `payload` 原样通过 SLE 发给小车。当前 `payload` 是小车现有固件可解析的 JSON。

## 控制 payload

当前正式 payload：

```json
{"cmd":"forward","speed":60,"duration_ms":350}
{"cmd":"backward","speed":40,"duration_ms":350}
{"cmd":"left","speed":50,"duration_ms":350}
{"cmd":"right","speed":50,"duration_ms":350}
{"cmd":"stop","speed":0,"duration_ms":0}
{"cmd":"auto_start"}
{"cmd":"auto_stop"}
```

队列规则：

- APK 摇杆输入在云端 action 中仍记为 `drive`，但 `payload` 会降级为当前小车可执行 JSON。
- `drive` 命令有效期约 `2s`，过期后不会再被基站拉取。
- 新 `drive` 会取消同一小车同一基站尚未完成的旧 `drive`，避免摇杆命令堆积。
- `stop` 会取消旧 `drive` 并保留自身，确保松手停车优先。

未来如果小车端支持差速协议，可以切换为：

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

## 回执命令状态

成功：

```bash
curl -X PATCH https://rxcccccc.icu/ws63-api/api/commands/<commandId>/ack \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"executed"}'
```

失败：

```bash
curl -X PATCH https://rxcccccc.icu/ws63-api/api/commands/<commandId>/ack \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"failed","errorMessage":"SLE timeout"}'
```

`status` 可选：`sent`、`executed`、`failed`。如果基站暂时无法做小车级确认，可以在 SLE 发送成功后直接回 `executed`。

## 拉取巡检任务

```bash
curl https://rxcccccc.icu/ws63-api/api/base-stations/sle-base-001/patrol-tasks/pending \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>"
```

基站拉取后，云端会把任务状态从 `pending` 更新为 `pulled`。

## 回执巡检任务状态

```bash
curl -X PATCH https://rxcccccc.icu/ws63-api/api/patrol-tasks/<taskId>/status \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"running"}'
```

合法流转：

- `pending -> pulled`
- `pending -> running`
- `pulled -> running`
- `running -> completed`
- `running -> failed`
- `pending/pulled -> cancelled`

完成任务：

```bash
curl -X PATCH https://rxcccccc.icu/ws63-api/api/patrol-tasks/<taskId>/status \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"completed"}'
```
