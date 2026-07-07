# WS63 软件侧后端验收清单

本文档用于比赛演示前检查云端后端、Web 验收页、基站协议和 APK 联调状态。

## 账号与权限

- `admin/admin123` 可以查看总览、遥控、巡检、趋势、Agent、设备、审计、后端验收页。
- `operator/operator123` 可以查看设备、发送遥控命令、创建巡检任务，不能进入审计和验收页。
- `viewer/viewer123` 只能查看总览、趋势、Agent 等只读内容，不能发送遥控命令。
- 401 token 失效时 Web 端会回到登录页。

## 核心 API

- `GET /api/health` 返回 `ok: true`。
- `POST /api/auth/login` 返回 token 与用户信息。
- `GET /api/dashboard?deviceId=ws63-car-001` 一次返回设备、基站、最新数据、命令、巡检任务和 Agent 报告。
- `PATCH /api/devices/:id` 只有管理员可更新设备名称、绑定基站、备注。
- `PATCH /api/devices/:id/status` 只有管理员可更新在线、离线、空闲、故障状态。
- `GET /api/export/readings.csv` 可导出遥测 CSV。
- `GET /api/export/audit.csv` 只有管理员可导出审计 CSV。
- `GET /api/export/summary.json` 可导出 dashboard 快照。

## 基站协议

- 遥测上传使用 `batchId` 幂等去重，同一 `batchId` 重试不会重复写 readings。
- 基站拉取命令后，命令状态从 `pending` 更新为 `pulled`。
- 基站回执命令支持 `sent`、`executed`、`failed`，失败时写入 `errorMessage`。
- 基站拉取巡检任务后，任务状态从 `pending` 更新为 `pulled`。
- 巡检任务只允许合法流转：`pending/pulled -> running`，`running -> completed/failed`，`pending/pulled -> cancelled`。

## Agent 与审计

- Agent 报告包含可解释证据 `evidence_json`。
- 高温、低温、低湿、高湿、强光、弱 RSSI、缓存积压会生成确定性风险提示。
- 登录、设备更新、命令创建、命令拉取、命令回执、遥测上传、巡检状态更新、Agent 生成都会写审计。
- 审计详情应包含 `requestId`、`actorRole`、输入和关键结果。

## Web 验收页

管理员登录后进入“验收”页：

- “刷新总览”应能重新拉取 dashboard。
- “创建命令”应写入一条 `FORWARD:30` 命令。
- “创建巡检”应写入一条两步巡检任务。
- “生成 Agent”应写入最新 Agent 报告。
- `readings.csv` 和 `summary.json` 链接应能下载或打开。

## 自动化验证

本地完整验证：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run dev:server
powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 -BaseUrl http://localhost:8787 -DeviceKey dev-base-station-key
```

云端完整验证：

```powershell
$env:DEVICE_INGEST_KEY="<云端真实密钥>"
powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 -BaseUrl https://www.rxcccccc.icu/ws63-api -DeviceKey $env:DEVICE_INGEST_KEY
```

全仓验证：

```powershell
npm run test
npm run build
```

## 演示前检查

- `pm2 status ws63-platform` 显示服务在线。
- `curl https://www.rxcccccc.icu/ws63-api/api/health` 返回成功。
- 浏览器可打开 `https://www.rxcccccc.icu/ws63/` 并登录。
- APK 可登录云端账号并看到实时数据。
- 基站使用真实 `DEVICE_INGEST_KEY` 能上传遥测。
- Web 遥控命令能被基站拉取并回执。
