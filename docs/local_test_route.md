# 本地项目与测试路线

本文记录当前本地工作区的完整项目入口、已验证命令和后续联调顺序。

## 1. 当前本地状态

仓库已经同步到远端主线：

```powershell
git status --short --branch
```

期望结果：

```text
## main...origin/main
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
- `npm run test` 通过：server 25 个测试通过，Web TypeScript 检查通过。
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

第一步建议只做遥测上云和命令队列闭环：

1. 小车继续按当前固件输出 telemetry JSON。
2. BearPi 或 PC 桥接程序把 `temp_x10/humi_x10/light_x10` 换算为真实单位。
3. 调用 `POST /api/ingest/base-stations/sle-base-001/telemetry` 上传云端。
4. Web/App 查看实时数据、趋势和 Agent 分析。
5. Web/App 创建命令。
6. 基站调用 `GET /api/base-stations/sle-base-001/commands/pending` 拉取命令。
7. 基站回执 `PATCH /api/commands/<id>/ack`。

### 6.2 控制协议注意点

当前 `origin/main` 云端命令 payload 为：

```text
FORWARD:<speed>
BACKWARD:<speed>
STOP:0
```

当前小车已验证协议更偏向：

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

以及裸文本：

```text
forward
backward
left
right
stop
auto_start
auto_stop
```

因此真实控制联调需要先做一层 payload 适配：

| 云端 payload | 小车当前可用命令 |
| --- | --- |
| `FORWARD:60` | `{"cmd":"forward","speed":60,"duration_ms":600}` 或 `forward` |
| `BACKWARD:30` | `{"cmd":"backward","speed":30,"duration_ms":600}` 或 `backward` |
| `STOP:0` | `{"cmd":"stop","speed":0,"duration_ms":0}` 或 `stop` |

`origin/main` 暂未覆盖 `left/right/auto_start/auto_stop` 的云端命令。完整摇杆和差速控制在 `origin/community/ws63e-env-gateway` 分支已有设计，但需要小车端新增 `DRIVE:left:right:duration` 解析后再合入。

## 7. 推荐联调顺序

1. 跑通本地软件：`npm ci`、`npm run test`、`npm run build`。
2. 跑通本地 API smoke：`deploy/smoke.ps1`。
3. App 队友对接云端账号、dashboard、命令创建、巡检任务、数据展示。
4. 硬件侧先上传真实 telemetry 到云端。
5. 再做命令队列拉取和回执。
6. 最后做云端 payload 到小车当前协议的 SLE 转发适配。
7. 使用 JDK 21 重跑 `npm run build:apk`，再跑 `npm run check:app-parity`。

## 8. 当前未完成项

- 云端到 BearPi 的自动基站桥接程序尚未在 `origin/main` 提供。
- 云端命令协议与当前车端控制解析还需要适配层。
- `left/right/auto_start/auto_stop` 尚未进入 `origin/main` 云端命令模型。
