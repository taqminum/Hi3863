# 本地项目与测试路线

本文记录当前本地工作区的完整项目入口、已验证命令和后续联调顺序。

## 1. 当前本地状态

仓库应先确认当前工作分支和远端状态：

```powershell
git status --short --branch
```

期望结果：

```text
## codex/project-collaboration...origin/codex/project-collaboration
```

当前本地包含以下主要部分：

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| WS63E 小车固件 | `src/application/samples/Farsight/ws63e_env_patrol_car` | 传感器、OLED、电机、SLE Client、Wi-Fi HTTP fallback |
| BearPi 本地网关固件 | `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` | 项目内版本化源码副本 |
| 社区版网关 demo | `vendor/others/demo/ws63e_env_gateway` | Wi-Fi UDP + SLE Server demo |
| 云端 API | `apps/server` | Node.js、SQLite、鉴权、基站接入、命令队列、Agent |
| Web / Android App | `apps/web` | React Web 与 Capacitor Android 工程 |
| 部署与 smoke | `deploy` | 云端部署、基站 API、APK 构建和 smoke test |

## 2. 软件本地验证路线

在仓库根目录执行：

```powershell
npm ci
npm run test
npm run build
```

当前已验证结果：

- `npm ci` 通过，`npm audit` 未发现漏洞。
- `npm run test` 通过：server 测试通过，Web TypeScript 检查通过。
- `npm run build` 通过：server TypeScript 构建通过，Web Vite 生产构建通过。

## 3. 本地 API smoke 路线

启动本地 API：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run dev:server
```

另开一个 PowerShell，执行：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/smoke.ps1 `
  -BaseUrl http://127.0.0.1:8787 `
  -DeviceKey dev-base-station-key
```

当前已验证 smoke 通过，覆盖：

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/dashboard?deviceId=ws63-car-001`
- Web 创建命令
- 基站拉取 pending command
- 基站回执 command ack
- Web 创建巡检任务
- 基站拉取 pending patrol task
- 基站回写 patrol task `running` 和 `completed`
- 基站上传 telemetry

## 4. 云端/API 联调入口

默认账号：

```text
admin/admin123
operator/operator123
viewer/viewer123
```

本地 API：

```text
http://127.0.0.1:8787
```

云端 API：

```text
https://www.rxcccccc.icu/ws63-api
```

Web 页面：

```text
https://www.rxcccccc.icu/ws63/
```

APK 云服务器模式使用：

```text
https://www.rxcccccc.icu/ws63-api
```

App 顶部状态需要分开判断：

- `云端已连接` 只表示手机到云端 HTTPS API 已连通，可访问 `/api/health`、登录、拉取 dashboard、创建命令和巡检任务。
- `实时遥测` 才表示基站或 PC 桥接程序持续上传了新的真实 telemetry。显示 `暂无遥测` 或 `遥测延迟 ...` 时，通常是 BearPi/PC 桥接没有继续上云，不代表 App 没连上云端。

云端 API 连通性先用下面命令确认：

```powershell
curl.exe -i https://www.rxcccccc.icu/ws63-api/api/health
```

基站接入协议：

```text
deploy/base-station-api.md
```

验收清单：

```text
docs/acceptance/backend-checklist.md
```

## 5. APK 构建路线

执行：

```powershell
npm run build:apk
```

该脚本会：

1. 使用云端 API 地址构建 Web。
2. 执行 `npx cap sync android`。
3. 执行 Android Gradle `assembleDebug`。

当前本地结果：

- Web 构建通过。
- Capacitor sync 通过，Android web assets 已生成到 `apps/web/android/app/src/main/assets/public/assets`。
- APK 已生成。
- APK 已通过 `deploy/check-app-parity.mjs` 检查。
- APK 已通过 `aapt dump badging` 检查，包名为 `icu.rxcccccc.ws63patrol`，启动 Activity 为 `icu.rxcccccc.ws63patrol.MainActivity`，包含 `android.permission.INTERNET`。
- APK 已通过 `apksigner verify --verbose` 检查，v1/v2 签名有效。
- APK 已在 Android 35 x86_64 模拟器中安装并启动，`MainActivity` 成为前台 Activity，logcat 未发现应用崩溃。

构建 APK 时需要使用 JDK 21。当前全局 `JAVA_HOME` 如果指向 JDK 25，Gradle 会报 `Unsupported class file major version 69`。推荐打包命令：

```powershell
$env:JAVA_HOME="G:\develop\JDK21"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
npm run build:apk
```

已将 `apps/web/android/gradle/wrapper/gradle-wrapper.properties` 的 `networkTimeout` 从 `10000` 调整为 `120000`，避免 Gradle 分发包下载在较慢网络下过早超时。

APK 期望输出：

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

## 6. 硬件联调路线

### 6.1 当前可立即联调

第一步建议做遥测上云、命令队列、巡检任务三条本地闭环：

1. 小车继续按当前固件输出 telemetry JSON。
2. BearPi 或 PC 桥接程序读取 BearPi UDP 网关返回的 telemetry JSON。
3. 如果 BearPi 作为 STA 接入 `SugarLab`，串口日志中的 DHCP 地址就是桥接目标，例如 `192.168.5.118:8888`。
4. 当前仓库可直接使用 `npm run bridge:cloud -- --once` 验证一次上云。
5. 桥接程序调用 `POST /api/ingest/base-stations/sle-base-001/telemetry` 上传云端。
6. 云端自动把 `temp_x10/humi_x10/light_x10` 转换为真实单位并写入 reading。
7. Web/App 查看实时数据、趋势和 Agent 分析。
8. Web/App 创建命令。
9. `bridge:control` 调用 `GET /api/base-stations/sle-base-001/commands/pending` 拉取命令并转发 UDP。
10. 基站回执 `PATCH /api/commands/<id>/ack`。
11. Web/App 创建巡检任务。
12. `bridge:patrol` 调用 `GET /api/base-stations/sle-base-001/patrol-tasks/pending` 拉取任务，逐步转发 UDP，并回写 `running/completed/failed`。

建议先按下面这组最短命令验证 telemetry 上云：

```powershell
$env:DEVICE_INGEST_KEY="<云端密钥>"
npm run dev:server
```

另开一个终端：

```powershell
npm run bridge:cloud -- --cloud-base-url http://127.0.0.1:8787 --gateway-host 192.168.5.118 --once
```

如果本地 API 验证通过，再切到正式云端：

```powershell
$env:DEVICE_INGEST_KEY="<云端密钥>"
npm run bridge:cloud -- --once
```

期望结果：

- 终端打印一条 `[cloud-bridge] uploaded ... status=201`
- Web 总览页出现新的环境读数
- `GET /api/dashboard?deviceId=ws63-car-001` 能看到最新 reading
- APK 显示 `云端已连接`，并在实时遥测区域显示最新读数或明确的遥测延迟

### 6.2 控制协议注意点

当前云端命令和巡检任务桥接都转发小车已验证的 JSON 控制协议：

```json
{"cmd":"forward","speed":35,"duration_ms":600}
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

控制闭环命令：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:control -- --cloud-base-url http://127.0.0.1:8787 --gateway-host 192.168.5.118 --timeout-ms 3000 --once
```

巡检任务闭环命令：

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:patrol -- --cloud-base-url http://127.0.0.1:8787 --gateway-host 192.168.5.118 --timeout-ms 3000 --once
```

完整摇杆和差速控制已接入云端命令模型、桥接格式、前端本地控制和小车端 `cmd=drive` 解析。硬件侧需要重新烧录小车固件后现场验证左右轮方向。

### 6.3 App 显示未实时更新时的排障顺序

如果 App 能登录但看起来没有连上云端，按下面顺序排：

1. `curl.exe -i https://www.rxcccccc.icu/ws63-api/api/health`，确认云端 API 返回 `200 OK`。
2. 在手机浏览器打开 `https://www.rxcccccc.icu/ws63/`，确认手机网络能访问公网域名。
3. 运行 `$env:DEVICE_INGEST_KEY="<云端密钥>"` 后执行 `npm run bridge:cloud -- --once`，确认终端打印 `status=201`。
4. 如果要持续刷新 App 实时数据，保持 `npm run bridge:cloud` 常驻运行，或把 BearPi 固件改为主动上云。
5. 如果 App/Web 创建了控制命令但小车无动作，分别运行 `npm run bridge:control -- --once` 和 `npm run bridge:patrol -- --once` 验证下行桥接。
6. 如果单次桥接失败，优先检查 BearPi 网关 IP 是否仍是 `192.168.5.118`、网关端口是否仍是 `8888`、`DEVICE_INGEST_KEY` 是否和云端 `.env` 一致。

## 7. 推荐联调顺序

1. 跑通本地软件：`npm ci`、`npm run test`、`npm run build`。
2. 跑通本地 API smoke：`deploy/smoke.ps1`。
3. App 队友对接云端账号、dashboard、命令创建、巡检任务、数据展示。
4. 硬件侧先上传真实 telemetry 到云端。
5. 再做命令队列拉取和回执。
6. 再做巡检任务拉取、执行和状态回写。
7. 使用 JDK 21 重跑 `npm run build:apk`，再跑 `npm run check:app-parity`。

## 8. 当前未完成项

- 当前已提供 PC 侧 telemetry 上云桥接工具 `npm run bridge:cloud`，BearPi 固件内置自动上云仍未完成。
- 当前已提供 PC 侧命令桥接工具 `npm run bridge:control`。
- 当前已提供 PC 侧巡检任务桥接工具 `npm run bridge:patrol`。
- 差速/非四向运动控制已完成代码接入，仍需重新烧录小车后做现场方向校准。
- 多小车调度与任务分配仍未完成。
