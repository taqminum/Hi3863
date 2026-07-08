# WS63 巡检平台云端部署说明

目标云服务器：`101.132.21.134`，域名：`rxcccccc.icu`。当前演示访问和 APK 默认联调入口使用带证书的 `https://www.rxcccccc.icu/ws63/`，不要把裸域 `rxcccccc.icu` 当作 App 默认 API 地址。

## 服务组成

- `apps/server`：Node.js API、SQLite、登录、权限、审计、设备管理、基站遥测接入、命令队列、巡检任务、Agent 规则分析、OpenAI-compatible 历史数据分析、SSE 实时推送。
- `apps/web`：React Web 管理端，可用 Capacitor 打包为 Android APK。
- 星闪基站：通过 SLE 与小车通信，通过云端 API 上传遥测、拉取控制命令和巡检任务。

Web 端默认作为云端验收和基站信息查看入口。APK 端支持三种链路：默认云服务器、星闪基站 Wi-Fi UDP、小车 SoftAP HTTP 直连。当前先支持单车 `ws63-car-001` 和单基站 `sle-base-001`，接口与数据模型保留多车、多基站、多用户扩展。

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

这里的 `DEVICE_INGEST_KEY` 是基站/桥接程序调用云端 API 时使用的设备上报鉴权密钥，不是云服务器 SSH 密钥、登录密码或云厂商 AccessKey。生产环境由云服务器负责人在 `apps/server/.env` 中配置一串强随机值，基站侧或 PC 桥接侧使用同一串值，通过 `X-Device-Key` 请求头接入。

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
DB_PATH=./data/ws63-platform.sqlite
PUBLIC_ORIGIN=https://www.rxcccccc.icu
SIMULATOR=0
CLOUD_HOST=101.132.21.134
CLOUD_DOMAIN=www.rxcccccc.icu
OPENAI_AGENT_ENABLED=0
OPENAI_BASE_URL=https://aigw.saurlax.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

基站密钥和 OpenAI-compatible API Key 只保存在 `.env` 和交付说明中，不提交源码。生产环境保持 `SIMULATOR=0`，只有本地演示需要自动模拟遥测时才临时设为 `SIMULATOR=1`。未设置 `OPENAI_AGENT_ENABLED=1` 或 `OPENAI_API_KEY` 时，Agent 自动使用本地规则引擎兜底，不影响演示。

启用模型分析时，在云端 `/home/rxcccccc/ws63-platform/apps/server/.env` 中追加：

```env
OPENAI_AGENT_ENABLED=1
OPENAI_BASE_URL=https://aigw.saurlax.com/v1
OPENAI_API_KEY=<你的网关 key>
OPENAI_MODEL=<兼容 chat.completions 的模型名>
```

不要把 `OPENAI_API_KEY` 写入 APK 或 Web 构建变量。APK 只把历史数据发给云端 `/api/agent/analyze-history`，由后端调用模型。

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

APK 内置链路选择：

- 云服务器：`https://www.rxcccccc.icu/ws63-api`，可读取长期云端历史。
- 星闪基站 Wi-Fi：`udp://192.168.6.1:8888`，用于基站附近短历史和遥控。
- 小车直连：`http://192.168.5.1:8080`，用于最后兜底实时遥测和遥控。

三种链路写入同一份手机本地 IndexedDB 缓存。历史曲线严格按时间段渲染，未收到数据的时间桶保持空白，不补线。

## App 云端状态判断

APK 顶部状态现在拆成两层理解：

- `云端已连接` 表示手机能访问 `https://www.rxcccccc.icu/ws63-api/api/health`，账号、命令队列、巡检任务和历史查询的 HTTPS API 是通的。
- `实时遥测` 表示云端最近一次收到基站或桥接程序上传的真实小车 telemetry。显示 `暂无遥测` 或 `遥测延迟 ...` 时，不等同于 App 没连上云端，通常是 BearPi/PC 桥接程序没有继续向云端上传。

现场排障时先验证 API，再验证遥测链路：

```powershell
curl.exe -i https://www.rxcccccc.icu/ws63-api/api/health

$env:DEVICE_INGEST_KEY="<云端 apps/server/.env 中的密钥>"
npm run bridge:cloud -- --once

powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 `
  -BaseUrl https://www.rxcccccc.icu/ws63-api `
  -DeviceKey $env:DEVICE_INGEST_KEY
```

如果 `curl` 返回 `200 OK` 而 App 显示遥测延迟，优先检查 BearPi 网关 IP、PC 是否正在运行 `npm run bridge:cloud`、`DEVICE_INGEST_KEY` 是否和云端 `.env` 一致，以及云端审计日志中最新 `telemetry_ingest` 时间。

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

如果命令可以在 App/Web 创建，但基站没有动作，说明云端 API 通了但桥接下行没有运行。用下面两条单次命令分别验证命令队列和巡检任务下行：

```powershell
$env:DEVICE_INGEST_KEY="<云端密钥>"
npm run bridge:control -- --once
npm run bridge:patrol -- --once
```

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
