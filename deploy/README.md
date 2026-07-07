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
