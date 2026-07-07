# WS63E 环境巡检小车

本仓库用于维护 WS63E 环境巡检小车的固件工程、星闪网关工程、Web 云平台、后端 API、部署脚本和 Android APK 打包工程。当前作品软件侧采用 Web 优先方案，Android 端通过 Capacitor 复用同一套 React 前端。

## 当前架构

作品完整交付架构：

```text
Web / Android App -> 云端 API -> BearPi-Pico H3863 网关 -> SLE/星闪 -> WS63E 小车
WS63E 小车 -> SLE/星闪遥测 -> BearPi 网关 -> 云端 API -> Web / Android App
```

固件本地调试和兜底路径：

```text
手机 App -> BearPi-Pico H3863 Wi-Fi 网关 -> SLE/星闪 -> WS63E 小车
WS63E 小车 -> SLE/星闪遥测 -> BearPi 网关 -> Wi-Fi -> 手机 App
```

WS63E 小车保持为唯一车辆控制器，负责传感器采集、OLED 显示、电机控制、安全停止逻辑和 Wi-Fi HTTP 兜底控制。

BearPi-Pico H3863 是无线网关，负责连接手机/云端并通过 SLE/星闪向小车转发控制命令。它不能作为第二个小车控制器直接接入车辆控制链路。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `src/application/samples/Farsight/ws63e_env_patrol_car` | WS63E 小车固件 |
| `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | BearPi 网关固件入口 |
| `vendor/BearPi-Pico_H3863/products/sle_uart` | BearPi 官方 SLE UART 参考样例 |
| `vendor/BearPi-Pico_H3863/products/sle_gateway` | BearPi 官方 SLE 网关参考样例 |
| `vendor/BearPi-Pico_H3863/wifi` | BearPi Wi-Fi 参考样例 |
| `apps/server` | Node.js 云端 API、SQLite 数据模型、登录鉴权、设备管理、命令队列、巡检任务、审计、SSE 和 Agent 分析 |
| `apps/web` | React Web 端和 Capacitor Android App 壳工程 |
| `deploy` | 云端部署、smoke test、基站协议和 APK 构建脚本 |
| `docs/ws63e_env_patrol_technical_chain.md` | 主要技术链路和项目计划 |
| `docs/repository_management.md` | 仓库管理规则 |

## 已验证状态

- WS63E 小车可以采集温度、湿度和光照数据。
- OLED 本地显示已工作。
- 小车前进、后退、左转、右转、停止电机命令已验证。
- 小车 Wi-Fi HTTP 兜底控制路径已工作。
- 小车 SLE client 可以连接 BearPi `sle_uart_server`。
- BearPi 可以通过 SLE 接收小车遥测 JSON。
- BearPi 串口命令可以通过 SLE 控制小车。

## 固件边界

本仓库同时维护两个固件目标，但二者边界必须清晰：

| 目标 | 路径 | 串口 |
| --- | --- | --- |
| WS63E 小车 | `src/application/samples/Farsight/ws63e_env_patrol_car` | COM6 |
| BearPi 网关源码副本 | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | COM5 |
| BearPi 网关构建工作区 | `G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway` | COM5 |

不要混用两个固件工程。共享行为应通过已文档化的控制命令协议和遥测协议表达。

## 主要协议

控制命令示例：

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

支持的命令：

```text
forward
backward
left
right
stop
auto_start
auto_stop
```

遥测示例：

```json
{"seq":1142,"temp_x10":304,"humi_x10":641,"light_x10":2958,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

## BearPi 本地 App 网关

当前 BearPi 网关已具备 UDP 本地 App 传输能力。在完整软件平台中，Web 和 Android 客户端以云端 API 为主入口，网关负责和云端同步遥测、控制命令和巡检任务。UDP 路径保留为固件本地兜底和硬件 smoke test 工具。

```text
SSID: WS63E_ENV_GATEWAY
Password: 12345678
Gateway IP: 192.168.6.1
UDP port: 8888
```

向 `192.168.6.1:8888` 发送 `forward`、`backward`、`left`、`right`、`stop`、`auto_start`、`auto_stop`，或发送同等 JSON 命令，即可进行本地控制。发送 `GET` 或 `data` 可以轮询最新遥测 JSON。

## 固件构建说明

小车工程入口：

```text
src/ws63e_env_patrol_car.hiproj
```

已知小车构建命令：

```powershell
Set-Location src
python build.py ws63-liteos-app
```

BearPi 网关开发应遵循官方 BearPi-Pico H3863 工作流，并把 `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` 作为干净的产品源码目录。

BearPi-Pico H3863 与小车工程分开编译。当前 VSCode/DevEco BearPi 工作区位于：

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
```

构建或烧录 BearPi 时，打开该 SDK 工作区，选择 `CONFIG_SAMPLE_SUPPORT_WS63E_ENV_GATEWAY=y`，重新构建 `ws63-liteos-app`，并烧录 COM5。小车工程仍在 `src` 下构建并烧录 COM6。

## 文档入口

建议从以下文档开始：

- `docs/ws63e_env_patrol_technical_chain.md`
- `docs/repository_management.md`
- `src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md`
- `src/application/samples/Farsight/ws63e_env_patrol_car/comm/PROTOCOL.md`
- `deploy/README.md`
- `deploy/base-station-api.md`
- `docs/acceptance/backend-checklist.md`

## 云端软件平台

云端平台采用 Web 优先设计，并可以通过 Capacitor 打包为 Android APK。Web 端和 Android App 使用同一套 React 代码与同一套云端 API。

默认演示账号：

```text
admin/admin123
operator/operator123
viewer/viewer123
```

本地开发：

```powershell
npm install
npm run dev:server
npm run dev:web
```

验证命令：

```powershell
npm run test
npm run build
npm run check:app-parity
```

面向云端 `/ws63/` 路径的 Web 生产构建：

```powershell
$env:VITE_BASE_PATH="/ws63/"
$env:VITE_API_BASE_URL="/ws63-api"
npm run build --workspace apps/web
```

Android APK 构建：

```powershell
npm run build:apk
```

APK 包名为 `icu.rxcccccc.ws63patrol`。debug APK 输出路径：

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

## 云端部署

预期云服务器为 `101.132.21.134`，域名为 `rxcccccc.icu`。

当前部署路径：

```text
Project: /home/rxcccccc/ws63-platform
Web root: /var/www/ws63-platform
pm2 service: ws63-platform
Web URL: https://rxcccccc.icu/ws63/
API URL: https://rxcccccc.icu/ws63-api/api/health
```

从 Windows 工作区部署：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/deploy.ps1
```

基站接入密钥和 JWT 密钥必须只保存在服务端 `.env` 文件中，不要提交真实密钥。
