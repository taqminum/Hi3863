# WS63 巡检平台云端部署说明

目标云服务器：`101.132.21.134`，域名：`rxcccccc.icu`。当前演示访问优先使用带证书的 `https://www.rxcccccc.icu/ws63/`。

## 服务组成

- `apps/server`：Node.js API、SQLite、登录、权限、审计、设备管理、基站遥测接入、命令队列、巡检任务、Agent 规则分析、SSE 实时推送。
- `apps/web`：React Web 管理端，可用 Capacitor 打包为 Android APK。
- 星闪基站：通过 SLE 与小车通信，通过云端 API 上传遥测、拉取控制命令和巡检任务。

手机端和 Web 端只连接云服务器，不直接连接小车局域网。当前先支持单车 `ws63-car-001` 和单基站 `sle-base-001`，接口与数据模型保留多车、多基站、多用户扩展。

## 当前云端路径

- 项目目录：`/home/rxcccccc/ws63-platform`
- Web 静态目录：`/var/www/ws63-platform`
- pm2 服务名：`ws63-platform`
- Web：`https://www.rxcccccc.icu/ws63/`
- API：`https://www.rxcccccc.icu/ws63-api/api/...`
- Node 本地监听：`127.0.0.1:8787`

## 部署

从 Windows 工作区执行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1
```

脚本会执行：

- `npm run test`
- `npm run build`
- 打包并上传源码到云服务器
- 云端 `npm ci`
- 云端以 `/ws63/` 和 `/ws63-api` 构建 Web
- 发布静态文件到 `/var/www/ws63-platform`
- 重启或启动 pm2 服务
- reload nginx
- 检查 `https://www.rxcccccc.icu/ws63-api/api/health`

如需完整基站协议 smoke test，部署前在本机 PowerShell 设置真实基站密钥：

```powershell
$env:DEVICE_INGEST_KEY="<云端 apps/server/.env 中的密钥>"
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1
```

也可以单独运行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 -BaseUrl https://www.rxcccccc.icu/ws63-api -DeviceKey $env:DEVICE_INGEST_KEY
```

本地 API 启动后可用开发密钥验证：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run dev:server
powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 -BaseUrl http://localhost:8787 -DeviceKey dev-base-station-key
```

## 环境变量

生产环境的 `apps/server/.env` 应至少包含：

```env
PORT=8787
JWT_SECRET=<随机强密钥>
DEVICE_INGEST_KEY=<随机强密钥>
DATABASE_PATH=./data/ws63-platform.sqlite
CLOUD_HOST=101.132.21.134
CLOUD_DOMAIN=rxcccccc.icu
```

基站密钥只保存在 `.env` 和交付说明中，不提交源码。

## APK 构建

Web 端打包 APK 时直接连接云端 API：

```powershell
cd apps/web
$env:VITE_BASE_PATH="/"
$env:VITE_API_BASE_URL="https://www.rxcccccc.icu/ws63-api"
npm run build
npx cap sync android
cd android
.\gradlew.bat -I gradle-mirror.init.gradle assembleDebug
```

APK 输出路径：

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

## 基站 API

完整接入协议见 [base-station-api.md](./base-station-api.md)。核心接口：

- `POST /api/ingest/base-stations/:id/telemetry`
- `GET /api/base-stations/:id/commands/pending`
- `PATCH /api/commands/:id/ack`
- `GET /api/base-stations/:id/patrol-tasks/pending`
- `PATCH /api/patrol-tasks/:id/status`

所有基站接口必须携带：

```http
X-Device-Key: <DEVICE_INGEST_KEY>
```

## Telemetry 桥接

如果 BearPi 固件暂时还没有主动上云，可以先在电脑上运行一个轻量桥接程序，把 BearPi UDP 网关中的最新 telemetry 转发到云端 ingest API。

单次验证：

```powershell
$env:DEVICE_INGEST_KEY="<云端密钥>"
npm run bridge:cloud -- --once
```

持续轮询上传：

```powershell
$env:DEVICE_INGEST_KEY="<云端密钥>"
npm run bridge:cloud
```

默认参数：

- BearPi UDP 网关：`192.168.6.1:8888`
- 云端 API：`https://www.rxcccccc.icu/ws63-api`
- 基站 ID：`sle-base-001`
- 小车 ID：`ws63-car-001`

常见调试覆盖：

```powershell
npm run bridge:cloud -- `
  --gateway-host 192.168.6.1 `
  --gateway-port 8888 `
  --cloud-base-url http://127.0.0.1:8787 `
  --base-station-id sle-base-001 `
  --device-id ws63-car-001 `
  --once
```

成功时会打印上传日志，包含 `seq` 和 HTTP 状态码。验证方式：

- Web 总览页刷新出最新环境数据
- `GET /api/dashboard?deviceId=ws63-car-001` 返回最新 reading
- 或继续执行 `deploy/smoke.ps1`

## 控制与巡检任务桥接

如果 BearPi 当前作为 STA 接入路由器，例如串口日志显示：

```text
[wifi_sta] DHCP success ip=192.168.5.118
```

则桥接目标需要使用 DHCP 地址，而不是默认 SoftAP 地址 `192.168.6.1`。

本地单次控制指令桥接：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:control -- `
  --cloud-base-url http://127.0.0.1:8787 `
  --gateway-host 192.168.5.118 `
  --gateway-port 8888 `
  --timeout-ms 3000 `
  --once
```

本地单次巡检任务桥接：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:patrol -- `
  --cloud-base-url http://127.0.0.1:8787 `
  --gateway-host 192.168.5.118 `
  --gateway-port 8888 `
  --timeout-ms 3000 `
  --step-delay-ms 100 `
  --once
```

`bridge:patrol` 会拉取 `/api/base-stations/:id/patrol-tasks/pending`，将 `steps_json` 中的 `action/speed/durationMs` 逐条转为小车 UDP 控制 payload，执行前回写 `running`，全部发送成功后回写 `completed`，失败时回写 `failed` 和错误信息。
