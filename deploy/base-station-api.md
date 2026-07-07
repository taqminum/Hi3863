# 星闪基站接入 API

基站通过 SLE 与小车交换数据，通过云端 API 与平台同步。手机端/Web 端只连接云端，不直接连接小车局域网。

## 基础信息

- 云端 API：`https://www.rxcccccc.icu/ws63-api`
- 本地调试：`http://127.0.0.1:8787`
- 鉴权头：`X-Device-Key: <DEVICE_INGEST_KEY>`
- 默认基站：`sle-base-001`
- 默认小车：`ws63-car-001`

## 上传遥测

`batchId` 用于幂等去重，基站重试同一批数据时保持相同 `batchId`。

```bash
curl -X POST https://www.rxcccccc.icu/ws63-api/api/ingest/base-stations/sle-base-001/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"batchId":"base-boot-001","sequence":1,"link":{"rssi":-52,"cachedCount":0,"mode":"sle"},"devices":[{"deviceId":"ws63-car-001","temperature":24.5,"humidity":53.2,"lightness":900,"gear":"D","direction":"forward","status":"moving"}]}'
```

首次写入返回 `201`，重复 `batchId` 返回 `200` 且 `duplicate: true`。

## 拉取待执行命令

```bash
curl https://www.rxcccccc.icu/ws63-api/api/base-stations/sle-base-001/commands/pending \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>"
```

返回命令中的 `payload` 可直接映射到小车控制协议，例如：

- `FORWARD:60`
- `BACKWARD:30`
- `STOP:0`

基站拉取后，云端会把命令状态从 `pending` 更新为 `pulled`。

## 回执命令状态

```bash
curl -X PATCH https://www.rxcccccc.icu/ws63-api/api/commands/<commandId>/ack \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"executed"}'
```

`status` 可为 `sent`、`executed`、`failed`。失败时带上原因：

```bash
curl -X PATCH https://www.rxcccccc.icu/ws63-api/api/commands/<commandId>/ack \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"failed","errorMessage":"SLE timeout"}'
```

## 拉取巡检任务

```bash
curl https://www.rxcccccc.icu/ws63-api/api/base-stations/sle-base-001/patrol-tasks/pending \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>"
```

基站拉取后，云端会把巡检任务状态从 `pending` 更新为 `pulled`。

## 回执巡检任务状态

```bash
curl -X PATCH https://www.rxcccccc.icu/ws63-api/api/patrol-tasks/<taskId>/status \
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
curl -X PATCH https://www.rxcccccc.icu/ws63-api/api/patrol-tasks/<taskId>/status \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: <DEVICE_INGEST_KEY>" \
  -d '{"status":"completed"}'
```
