# WS63E 环境巡检小车项目技术链路

## 1. 当前结论

本项目当前已经从硬件摸底阶段进入工程定版阶段。实测结果表明，WS63E 小车本体、Wi-Fi 遥控链路、BearPi-Pico H3863 SLE 双向链路均已跑通，没有发现会阻塞后续工程推进的硬件缺憾。后续正式方案建议调整为：BearPi-Pico H3863 作为 Wi-Fi 主控网关，手机 App 连接 BearPi，小车通过 SLE 接收 BearPi 转发的控制命令。

当前项目名称建议统一为：

```text
基于 WS63 平台的移动式环境监测巡检小车与可视化智能分析系统
```

核心定位：

- WS63E 小车是唯一车体主控，负责传感器采集、OLED 显示、电机执行和安全停止。
- BearPi-Pico H3863 作为 Wi-Fi 主控网关和 SLE Server，不接小车传感器、电机、OLED 或其他硬件。
- 手机 App 主链路改为连接 BearPi Wi-Fi，由 BearPi 把控制消息通过 SLE 转发给小车。
- 小车原有 Wi-Fi HTTP 链路保留为调试、验收和兜底通道，不作为正式演示主链路。
- SLE/星闪处在正式控制链路中：用于 BearPi 与小车之间的遥控下发和遥测回传。

## 2. 工程入口

小车工程入口：

```text
G:\fbb_ws63_20260226\src\ws63e_env_patrol_car.hiproj
```

小车固件源码：

```text
G:\fbb_ws63_20260226\src\application\samples\Farsight\ws63e_env_patrol_car
```

仓库内 BearPi-Pico H3863 源码副本：

```text
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863
```

实际 VSCode/DevEco BearPi SDK 工程根目录：

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
```

BearPi 现有参考样例在真实 SDK 中位于：

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\sle_uart
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\sle_gateway
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ble_uart
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\wifi\softap_sample
```

仓库内也保留一份 BearPi 参考源码副本：

```text
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\sle_uart
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\sle_gateway
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\ble_uart
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\wifi\softap_sample
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\wifi\udp_client
```

BearPi 后续新工程建议单独新建，不直接污染官方样例：

```text
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\ws63e_env_gateway
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway
```

烧录配置：

```text
小车 COM6，115200
固件包：G:\fbb_ws63_20260226\src\output\ws63\fwpkg\ws63-liteos-app\ws63-liteos-app_all.fwpkg
```

BearPi-Pico H3863 工程按官方推荐工作流维护，并且必须与小车工程分开编译。当前已在官方样例基础上形成 Wi-Fi + SLE UDP 网关，广播的 SLE 名称为：

```text
sle_uart_server
```

### 2.1 工程边界与干净交付规则

小车工程和 BearPi 工程不在同一个业务目录内，必须按两个固件工程管理：

| 固件 | 目录 | 角色 | 串口 |
| --- | --- | --- | --- |
| WS63E 小车 | `src\application\samples\Farsight\ws63e_env_patrol_car` | 车体主控、传感器、电机、SLE Client、Wi-Fi fallback | COM6 |
| BearPi-Pico H3863 源码副本 | `vendor\BearPi-Pico_H3863\products\ws63e_env_gateway` | 仓库管理、代码审查和交付记录 | COM5 |
| BearPi-Pico H3863 实际编译目录 | `G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway` | VSCode/DevEco 编译、烧录的真实工程 | COM5 |

编译入口必须分开：

```text
小车：G:\fbb_ws63_20260226\src
BearPi：G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
```

BearPi 网关源码若先在仓库 `vendor` 副本中修改，需要同步到真实 SDK 的 `application\samples\products\ws63e_env_gateway` 后，再用 VSCode/DevEco 选择 `CONFIG_SAMPLE_SUPPORT_WS63E_ENV_GATEWAY=y` 编译和烧录 COM5。

为了保证新工程完整和干净，后续开发应遵守以下规则：

1. BearPi 网关新建 `ws63e_env_gateway` 产品目录，从 `sle_uart` 或 `sle_gateway` 拷贝最小可运行骨架，再按需引入 Wi-Fi AP/HTTP 或 UDP 代码。
2. 不在 `vendor\BearPi-Pico_H3863\products\sle_uart`、`sle_gateway`、`ble_uart` 原样例里直接做正式业务开发；这些目录作为官方参考和回退基线保留。
3. 不把小车源码复制进 BearPi 工程，也不把 BearPi 网关源码复制进小车工程；双方只通过统一协议通信。
4. 跨工程共享的内容只允许是文档化协议：控制命令 JSON、裸文本命令、telemetry JSON 字段。
5. 小车端已有功能只做必要适配：保持 SLE Client、HTTP fallback、安全停止和短时动作策略，不为了 BearPi 网关重写车体逻辑。
6. BearPi 端新工程必须有独立 README，写清楚编译选项、烧录串口、热点名称、接口路径、SLE 广播名和测试步骤。
7. 每次交付至少验证两条链路：`BearPi COM5 -> SLE -> 小车` 和 `手机/电脑 -> BearPi Wi-Fi -> SLE -> 小车`。
8. 当前第一版网关闭环使用 UDP，目录、协议和 README 按正式工程标准维护；HTTP 只作为后续可选增强。

这样做的目标是：官方样例可回退，小车工程可独立编译，BearPi 网关工程可独立烧录，App 队友只需要面对一套稳定协议。

## 3. 硬件边界

### 3.1 小车侧

已确认小车硬件能力：

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| WS63E 主控 | 已验证 | 作为小车唯一嵌入式主控 |
| AHT20 | 已验证 | 温湿度采集，I2C 地址 `0x38` |
| BH1750 | 已验证 | 光照采集，I2C 地址 `0x23` |
| SSD1306 OLED | 已验证 | 本地状态显示，I2C 地址 `0x3C` |
| 电机 PWM 桥 | 已验证 | I2C 地址 `0x5A`，可控制前进、后退、左转、右转、停止 |
| PCA9555 | 已探测 | I2C 地址 `0x28`，当前不是主功能依赖 |
| CW2015 | 已探测 | I2C 地址 `0x62`，可作为后续电量扩展 |
| 蜂鸣器 | 不使用 | 当前小车不把蜂鸣器纳入功能设计 |
| 巡线模块 | 不存在 | 不得写成巡线、循迹或闭环导航 |

I2C 基线：

```text
I2C bus: 1
SCL: GPIO15
SDA: GPIO16
Pin mode: 2
Baudrate: 100000
Master code: 0
地址格式：WS63 I2C API 使用 7-bit 地址
```

### 3.2 BearPi-Pico H3863 侧

BearPi-Pico H3863 的定位：

- 用作正式方案中的 Wi-Fi 主控网关。
- 对手机 App 提供 Wi-Fi AP + HTTP 或 UDP 控制入口。
- 对小车提供 SLE Server，维持 `sle_uart_server` 广播名，方便复用当前已跑通的小车 SLE Client。
- 通过 COM5 串口观察网关日志、小车上报数据和调试命令。
- 不作为小车第二车控主板。
- 不连接小车本体硬件。

已验证链路：

```text
小车 telemetry JSON -> SLE -> BearPi server -> COM5 串口打印
BearPi COM5 输入控制命令 -> SLE -> 小车 client -> 电机控制
当前：手机 App 控制命令 -> Wi-Fi UDP -> BearPi gateway -> SLE -> 小车 client -> 电机控制
当前：小车 telemetry JSON -> SLE -> BearPi gateway -> Wi-Fi UDP -> 手机 App
```

## 4. 系统链路总览

```text
                  +----------------------+
                  |      手机 App         |
                  | Wi-Fi HTTP/UDP       |
                  +----------+-----------+
                             |
                             | 连接 BearPi 网关热点
                             v
                  +----------+-----------+
                  | BearPi-Pico H3863    |
                  | Wi-Fi AP + Gateway   |
                  | SLE UART Server      |
                  +----------+-----------+
                             |
                             | SLE / 星闪
                             v
+----------------------------+----------------------------+
|                         WS63E 小车                      |
|                                                          |
| AHT20/BH1750 -> env_data -> OLED                         |
|                         |                                |
|                         +-> SLE telemetry -> BearPi       |
|                         |                                |
|                         +-> HTTP API / Web page fallback  |
|                                                          |
| SLE/HTTP 控制命令 -> control_command -> car_motor -> 0x5A |
+----------------------------+----------------------------+

兜底调试链路：

手机/电脑 -> 小车 Wi-Fi AP `WS63E_ENV_CAR` -> 小车 HTTP API
```

## 5. 小车端软件模块

当前模块边界：

```text
ws63e_env_patrol_car/
|-- app_main.c
|-- board/
|   |-- car_board.c/.h
|-- drivers/
|   |-- i2c_bus.c/.h
|-- sensors/
|   |-- aht20.c/.h
|   |-- bh1750.c/.h
|-- display/
|   |-- oled_status.c/.h
|-- motor/
|   |-- car_motor.c/.h
|-- patrol/
|   |-- patrol_route.c/.h
|-- comm/
|   |-- telemetry.c/.h
|   |-- wifi_ap.c/.h
|   |-- control_command.c/.h
|   |-- sle_client.c/.h
|   |-- PROTOCOL.md
|   |-- CONTROL.md
|-- model/
|   |-- env_data.h
```

职责说明：

| 模块 | 职责 |
| --- | --- |
| `app_main.c` | 系统入口、任务创建、周期调度 |
| `board` | I2C/pinmux/已知设备探测 |
| `drivers/i2c_bus` | 统一 I2C read/write/probe 包装 |
| `sensors` | AHT20、BH1750 采集与数值换算 |
| `display` | OLED 本地显示 |
| `motor` | 电机动作抽象，支持停止保护 |
| `patrol` | 预设开环动作序列 |
| `comm/telemetry` | 统一 JSON 遥测输出 |
| `comm/wifi_ap` | 小车 SoftAP、HTTP 页面、HTTP API |
| `comm/control_command` | 控制命令解析，供 Wi-Fi 和 SLE 共用 |
| `comm/sle_client` | 连接 BearPi server、收发 SLE 数据 |

## 6. 数据协议

### 6.1 遥测 JSON

小车每个采样周期输出一帧 JSON：

```json
{
  "seq": 1142,
  "temp_x10": 304,
  "humi_x10": 641,
  "light_x10": 2958,
  "temp_alert": 0,
  "humi_alert": 0,
  "light_alert": 0,
  "motion": 0,
  "patrol": 0,
  "err": 0
}
```

字段含义：

| 字段 | 单位/类型 | 说明 |
| --- | --- | --- |
| `seq` | 计数 | 单调递增采样序号 |
| `temp_x10` | 0.1 C | 温度 |
| `humi_x10` | 0.1 %RH | 湿度 |
| `light_x10` | 0.1 lx | 光照 |
| `temp_alert` | bool | 温度阈值告警 |
| `humi_alert` | bool | 湿度阈值告警 |
| `light_alert` | bool | 光照阈值告警 |
| `motion` | enum | `0` stop, `1` forward, `2` backward, `3` left, `4` right |
| `patrol` | bool | 预设开环巡检是否启用 |
| `err` | code | 最近一次错误码，`0` 表示正常 |

这份 JSON 同时用于：

- 小车串口日志。
- 小车 HTTP `GET /api/data`。
- 小车本地 Web 页面。
- SLE 上报到 BearPi 网关。
- BearPi 通过 Wi-Fi 返回给手机 App。
- 后续 PC/Web 展示或手机 App 解析。

### 6.2 控制协议

手机 App 与 BearPi 网关之间推荐使用 JSON：

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

可用命令：

```text
forward
backward
left
right
stop
auto_start
auto_stop
```

BearPi 串口调试和 SLE 链路也支持裸文本命令：

```text
forward
stop
left
right
backward
auto_start
auto_stop
```

安全规则：

- 单次动作默认短时运动。
- 当前普通动作默认持续约 `600 ms`。
- `duration_ms` 最大限制为 `3000 ms`。
- 手动命令会先停止预设巡检，再执行人工动作。
- `stop` 必须始终可用。

## 7. Wi-Fi / 手机 App 主链路

正式方案中，BearPi-Pico H3863 作为 Wi-Fi 主控网关。手机 App 连接 BearPi，而不是直接连接小车。BearPi 接收 App 命令后，通过 SLE 发给小车；小车通过 SLE 回传遥测 JSON，BearPi 再通过 Wi-Fi 返回给 App。

BearPi 当前作为 SoftAP，第一版 App 主链路使用 UDP：

```text
SSID: WS63E_ENV_GATEWAY
Password: 12345678
Gateway IP: 192.168.6.1
UDP port: 8888
```

当前 UDP 入口：

```text
Phone/App -> 192.168.6.1:8888
控制：forward / backward / left / right / stop / auto_start / auto_stop
遥测：发送 GET 或 data，返回最近一帧 telemetry JSON
```

HTTP API `GET /api/data`、`POST /api/control`、`GET /api/status` 保留为后续可选增强，不作为当前第一版交付前提。

网关职责：

1. 启动 Wi-Fi AP，等待手机 App 连接。
2. 启动 SLE UART Server，等待小车 SLE Client 连接。
3. 接收 App 的 UDP 控制报文，提取 JSON 或裸文本命令。
4. 将控制命令原样或规范化后通过 SLE 写给小车。
5. 接收小车通过 SLE 上报的 telemetry JSON。
6. 缓存最近一帧 telemetry，供 App 通过 UDP `GET` 或 `data` 查询。
7. 在串口日志中输出 Wi-Fi、SLE 连接、UDP 收发和最近遥测状态，供调试确认。

手机 App 需要做的事情：

1. 连接 BearPi Wi-Fi：`WS63E_ENV_GATEWAY`。
2. 每秒左右向 `192.168.6.1:8888` 发送 `GET` 或 `data`，刷新环境数据和运动状态。
3. 按下方向键时向 `192.168.6.1:8888` 发送方向命令。
4. 如果做“按住持续移动”，按住期间每 `300-500 ms` 重复发送同一方向命令。
5. 松开方向键立即发送 `stop`。
6. 使用 `auto_start` 和 `auto_stop` 控制预设开环巡检。
7. 根据 UDP 遥测响应和后续状态字段显示网关/SLE 状态，避免小车未连接时误以为控制失败。

注意：

- 手机可能因为 BearPi AP 无互联网而自动切走网络，测试时应关闭智能网络切换或移动数据辅助。
- 手机 App 不需要直接接 SLE。
- App 协议应保持和小车当前控制协议一致，避免 BearPi 和小车两边维护两套命令。

### 7.1 小车 Wi-Fi 兜底链路

小车原有 SoftAP/HTTP 链路保留为调试和兜底：

```text
SSID: WS63E_ENV_CAR
Password: 12345678
Base URL: http://192.168.5.1:8080
```

接口：

```http
GET /api/data
POST /api/control
GET /
```

用途：

- BearPi 网关尚未完成时，继续验证小车电机、传感器和 HTTP API。
- 网关链路异常时，用于判断问题在小车端还是 BearPi 端。
- 答辩或演示时作为备用控制入口，不作为主叙事。

## 8. SLE / 星闪主控链路

### 8.1 当前角色

```text
BearPi-Pico H3863: SLE UART Server
WS63E 小车: SLE Client
```

该角色建议保持不变。原因是当前小车 SLE Client 已经实测稳定，BearPi 官方 SLE UART Server 工作流也已跑通；后续只需要在 BearPi Server 侧增加 Wi-Fi 网关逻辑，不必反转 SLE 主从角色。

小车启动后扫描：

```text
sle_uart_server
```

连接成功日志示例：

```text
[car][sle] found target sle_uart_server
[car][sle] connect requested
[car][sle] conn state=1 pair=1 reason=0x0
[car][sle] pair complete conn=0 status=0
[car][sle] exchange client=0 conn=0 mtu=520 status=0
[car][sle] write handle=2 ready
```

### 8.2 已验证能力

小车到 BearPi：

```text
[sle uart server] ssaps write request callback ...
sle uart recived data : {"seq":...}
```

BearPi 到小车：

```text
[car][sle] rx stop
[car] control apply motion=0 speed=0 duration=0
```

运动命令测试已通过：

- `forward`
- `backward`
- `left`
- `right`
- `stop`

### 8.3 网关化改造目标

BearPi 已经从“串口 SLE Server”升级为第一版“Wi-Fi + SLE UDP 网关”：

```text
App UDP input -> BearPi command parser -> SLE notify -> 小车
小车 SLE telemetry -> BearPi latest-data cache -> UDP response -> App
```

当前交付基线固定为 UDP：`192.168.6.1:8888`。HTTP 仍可作为后续增强，但不再是当前主链路或验收阻塞项。

### 8.4 当前限制

- BearPi 串口打印中偶尔有乱码，推测来自官方 server 对非 `\0` 结尾 buffer 的打印方式，不影响数据链路。
- 裸文本命令适合串口调试；正式 App 仍推荐 JSON。
- 单次移动只执行一小段，这是故意保留的安全策略，不是故障。

## 9. BLE 蓝牙可选扩展

BearPi-Pico H3863 具备 BLE 能力，本地工程中也存在 `products/ble_uart` 示例。因此“手机 BLE -> BearPi -> SLE -> 小车”理论上可以做。

但 BLE 不建议作为主链路，原因如下：

- 手机 App 侧需要处理 BLE 扫描、连接、GATT 服务发现、特征写入、通知订阅、权限和断线重连，工作量高于 Wi-Fi HTTP。
- BearPi 侧需要验证 BLE 与 SLE 同固件并发运行，官方样例存在但不等于网关工程已经集成。
- 项目展示重点是星闪/SLE，小熊派 Wi-Fi 网关已经足以让 SLE 出现在正式链路中。

建议定位：

- 第一阶段不做 BLE。
- 第二阶段如果时间充足，把 BLE UART 作为备用入口，仍复用同一套控制命令和 telemetry JSON。
- 不为了加入 BLE 而修改小车端协议。

## 10. 小车具体功能讨论

### 10.1 已完成或基本完成的功能

1. 环境采集
   - 温度、湿度、光照周期采样。
   - 采样数据进入统一 JSON。

2. 本地显示
   - OLED 显示环境数据、运动状态、告警状态。

3. 手机 App 遥控
   - BearPi 开启 Wi-Fi AP。
   - 手机连接 BearPi。
   - BearPi 通过 SLE 控制小车。

4. 小车网页/HTTP 兜底遥控
   - 小车保留 Wi-Fi AP。
   - 手机或电脑访问小车本地页面。
   - 支持前进、后退、左转、右转、停止。

5. 预设开环巡检
   - `auto_start` 启动固定动作序列。
   - `auto_stop` 停止动作序列。
   - 这是开环动作脚本，不是巡线或自动导航。

6. 轻量环境分析
   - 温度高、湿度高、光照低三个告警位。
   - OLED 和 Web 可展示告警状态。

7. SLE 主控链路
   - 小车向 BearPi 上报环境数据。
   - BearPi 把手机 App 命令转发给小车。
   - BearPi 串口仍可保留为调试入口。

### 10.2 建议保留为正式功能的内容

正式演示时建议把项目功能收束为七项：

1. 移动环境采集
   - 小车可在不同位置采集温湿度和光照。

2. 本地 OLED 状态显示
   - 离线情况下仍能看见环境数据。

3. 手机 App 遥控
   - 主交互方式为手机连接 BearPi Wi-Fi。
   - BearPi 通过 SLE 控制小车。

4. BearPi Wi-Fi 网关
   - 给 App 提供数据接口和控制接口。
   - 作为手机与小车之间的协议转换节点。

5. 预设开环巡检
   - 用固定动作序列模拟巡检路线。
   - 明确不称为巡线、不称为自主导航。

6. SLE/星闪数据互传
   - 展示 BearPi 与小车之间的近距离低时延控制和遥测。

7. 小车 HTTP 兜底通道
   - 便于调试和现场应急。
   - 不作为正式主链路叙事。

### 10.3 不建议加入的功能

以下功能当前不建议写进正式需求：

- 巡线。
- 避障。
- 精确定位。
- 闭环导航。
- 蜂鸣器告警。
- 气体传感器基站联动。
- BearPi 作为第二车控主板。

原因是当前硬件事实不支持，写进去会让项目叙事变虚。

## 11. 演示流程建议

### 11.1 主链路演示

1. BearPi 上电，启动 Wi-Fi AP 和 SLE Server。
2. 小车上电，自动扫描并连接 `sle_uart_server`。
3. BearPi COM5 确认 SLE 已连接、收到小车 telemetry JSON。
4. 手机连接 BearPi Wi-Fi：`WS63E_ENV_GATEWAY`。
5. 打开 App 或浏览器页面。
6. 展示温湿度、光照、告警状态。
7. 手机遥控前进、后退、左转、右转、停止。
8. 启动 `auto_start`，展示预设开环巡检。
9. 执行 `auto_stop` 或手动 `stop`。

### 11.2 星闪链路说明演示

1. 展示 App 发出控制命令。
2. 展示 BearPi 日志收到 Wi-Fi 命令。
3. 展示 BearPi 通过 SLE 转发给小车。
4. 展示小车串口出现 `[car][sle] rx forward/left/...`。
5. 展示小车 telemetry JSON 经 SLE 回到 BearPi。
6. 说明小车本体不依赖 BearPi 硬接线，二者只通过 SLE 通信。

### 11.3 兜底链路演示

1. 手机或电脑连接小车 Wi-Fi：`WS63E_ENV_CAR`。
2. 访问 `http://192.168.5.1:8080`。
3. 验证小车本体 HTTP API 仍可控制。
4. 说明该链路用于调试和现场兜底。

## 12. 后续工程计划

### 12.1 BearPi Wi-Fi + SLE 网关

- 当前第一版 UDP 网关已作为交付基线：`WS63E_ENV_GATEWAY` / `192.168.6.1:8888`。
- 保持 SLE UART Server 名称：`sle_uart_server`。
- 保持 App 控制命令通过 UDP 进入 BearPi，再通过 SLE notify 下发到小车。
- 保持小车 telemetry JSON 在 BearPi 缓存，并通过 UDP `GET` 或 `data` 返回给 App。
- 保留 COM5 串口日志和裸文本调试能力。
- HTTP 接口 `GET /api/data`、`POST /api/control`、`GET /api/status` 仅作为后续可选增强。

### 12.2 小车固件定版

- 保持小车 SLE Client 角色不变。
- 减少电机 I2C 调试日志，保留关键状态。
- 保留 SLE 连接关键日志。
- 保留小车 Wi-Fi HTTP 作为 fallback/debug。
- 将固件版本号更新为最终演示版本。
- 确认 `stop`、短时动作、自动巡检停止策略稳定。

### 12.3 App 对接

- 向 App 队友提供 `CONTROL.md`、本文件第 7 节和第 8 节。
- App 优先对接 BearPi Wi-Fi 网关，而不是小车 Wi-Fi。
- App 当前对接 UDP：`192.168.6.1:8888`。
- App 按住方向键时周期发命令，松开发 `stop`。
- App 通过 telemetry 响应显示环境数据和运动状态；网关/SLE 状态可先用串口确认，后续再扩展状态字段。
- App 保留“调试模式”配置项，可手动切换到小车 fallback 地址 `http://192.168.5.1:8080`。

### 12.4 BLE 可选增强

- 若主链路完成且时间充足，再评估 BLE UART。
- BLE 入口只作为手机到 BearPi 的备用入口。
- BLE 使用同一套控制命令和 telemetry JSON。
- 不修改小车端协议。

### 12.5 展示材料

- 画系统架构图。
- 录制主链路演示。
- 录制 Wi-Fi -> BearPi -> SLE -> 小车演示。
- 录制小车 Wi-Fi fallback 演示。
- 准备答辩话术：主链路、扩展链路、硬件边界、限制说明。

## 13. 当前状态一句话

当前项目已经完成 WS63E 小车的环境采集、本地显示、小车 Wi-Fi HTTP 兜底遥控、预设开环巡检、轻量环境分析以及 BearPi-Pico H3863 SLE 双向控制验证。正式工程计划调整为：手机 App 连接 BearPi Wi-Fi 网关，BearPi 通过 SLE/星闪控制小车并回传遥测；小车原 Wi-Fi HTTP 保留为调试和现场兜底。
