# BearPi Gateway SLE 通知下发失败问题 ✅ 已解决

**解决日期**: 2026-07-06
**根因**: property `operate_indication` 缺少 `SSAP_OPERATE_INDICATION_BIT_NOTIFY`
**修复**: `sle_uart_server.c` 中 `sle_uuid_server_property_add()` 改为 SDK 官方版本声明

## 现象

BearPi 网关完整链路通了，但手机 App 命令无法下发到小车：

| 方向 | 状态 | 说明 |
|---|---|---|
| 小车 → BearPi (telemetry) | ✅ 正常 | 小车通过 `ssapc_write_cmd` 发送遥测，BearPi 在 `write_request_cbk` 中收到 |
| BearPi → 小车 (command) | ❌ 失败 | BearPi 通过 `ssaps_notify_indicate` 发送命令，小车 `notification_cb` 从未触发 |

## 已排查确认的事实

1. **Wi-Fi AP 正常** — `WS63E_ENV_GATEWAY`，IP 192.168.6.1，手机/电脑可连接
2. **UDP 桥正常** — 端口 8888，接收命令后调用 SLE 发送函数
3. **SLE 连接正常** — 小车连接成功，pair complete，discovery complete
4. **小车 discovery 结果** — `write handle=2 ready`，与 BearPi 端 `property_handle:2` 一致
5. **SLE UUID 一致** — service=0x2222, property=0x2323，双方匹配
6. **SLE MTU** — 双方都是 520（exchange info 确认）
7. **发送函数返回值** — `sle_uart_server_send_report_by_handle` 和 `sle_uart_server_send_report_by_uuid` 均返回 `ERRCODE_SLE_SUCCESS` (0)

## 关键调试信息

COM5 发送命令时的日志：
```
[udp_bridge] SLE conn_hdl=0 pair_hdl=1, forwarding 7 bytes
update ssap send report handle: pre handle:ffff, current:0
[udp_bridge] forwarded to SLE: ret=0
```

- `conn_hdl=0` — SLE 框架分配给此连接的 ID 是 0
- `update ssap send report handle: pre handle:ffff, current:0` — SSAP 内部 handle 映射失败（pre=0xFFFF 表示未初始化，current=0 表示无效）
- 但 `ssaps_notify_indicate` 返回成功

## 已尝试的修复

| 尝试 | 结果 |
|---|---|
| 使用 `send_report_by_handle` (栈缓冲区) | ❌ ret=0 但小车未收到 |
| 使用 `send_report_by_uuid` (堆缓冲区) | ❌ ret=0 但小车未收到 |

## 当前结论

最可能根因不是 Wi-Fi、UDP、MTU、UUID、`conn_id=0`，也不是小车侧 `notification_cb` 未注册，而是 BearPi 网关的 SSAP property 声明与官方可工作的 `sle_uart_server` 样例不一致：

当前网关代码：

```c
property.operate_indication = SLE_UUID_TEST_OPERATION_INDICATION;
```

而 `SLE_UUID_TEST_OPERATION_INDICATION` 在当前 `sle_uart_server.h` 中定义为：

```c
SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_WRITE
```

这意味着该 property 只声明了读/写能力，没有声明 `SSAP_OPERATE_INDICATION_BIT_NOTIFY`。服务端虽然调用了 `ssaps_notify_indicate` / `ssaps_notify_indicate_by_uuid`，并且 API 返回 `ERRCODE_SLE_SUCCESS`，但 SSAP 内部无法把该 property 作为有效 notify report 发送给 client，因此小车侧 `notification_cb` 不触发。

`update ssap send report handle: pre handle:ffff, current:0` 与这个判断一致：`pre=0xFFFF` 表示内部 report handle 尚未建立，`current=0` 是无效映射。`ret=0` 只能说明调用进入栈成功，不代表客户端实际收到通知。

官方可工作的 `sle_uart_server` 样例中，同一段逻辑是：

```c
property.operate_indication = SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_NOTIFY;
descriptor.type = SSAP_DESCRIPTOR_USER_DESCRIPTION;
descriptor.operate_indication = SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_WRITE;
```

因此，优先修 BearPi 网关服务端的 property/descriptor 声明，不优先修改小车端。

## 推荐修复方案

在以下两个位置保持同步修改：

```text
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\ws63e_env_gateway\sle_uart_server.c
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway\sle_uart_server.c
```

将 `sle_uuid_server_property_add()` 恢复为官方 `sle_uart_server` 样例的 notify 属性声明：

```c
uint8_t ntf_value[] = {0x01, 0x0};

property.permissions = SLE_UUID_TEST_PROPERTIES;
property.operate_indication = SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_NOTIFY;
sle_uuid_setu2(SLE_UUID_SERVER_NTF_REPORT, &property.uuid);

descriptor.permissions = SLE_UUID_TEST_DESCRIPTOR;
descriptor.type = SSAP_DESCRIPTOR_USER_DESCRIPTION;
descriptor.operate_indication = SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_WRITE;
descriptor.value = ntf_value;
descriptor.value_len = sizeof(ntf_value);
```

同时检查 `sle_uart_server.h`，避免继续用 `SLE_UUID_TEST_OPERATION_INDICATION` 表达 notify property。建议保留该宏只用于写类属性，或者新增清晰宏：

```c
#define SLE_UUID_TEST_NOTIFY_OPERATION \
    (SSAP_OPERATE_INDICATION_BIT_READ | SSAP_OPERATE_INDICATION_BIT_NOTIFY)
```

第一版修复建议只改 BearPi 网关，不改小车。小车已在官方 server 样例下验证过可以收到通知，当前问题来自网关服务端属性声明偏离官方样例。

## 修复后验证步骤

1. 在真实 BearPi SDK 中重新编译：

```powershell
Set-Location G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
$env:PATH = "G:\DevTools_CFBB_V1.0.12\thirdparty\ccache;$env:PATH"
python build.py ws63-liteos-app
```

2. 烧录 BearPi COM5。
3. 小车 COM6 复位或重新上电，确认连接 BearPi：

```text
[car][sle] pair complete
[car][sle] write handle=2 ready
```

4. 手机/电脑连接 `WS63E_ENV_GATEWAY`，向 `192.168.6.1:8888` 发送：

```text
forward
```

5. 预期 BearPi COM5：

```text
[udp_bridge] rx ... => forward
[udp_bridge] forwarded to SLE: ret=0
```

6. 预期小车 COM6：

```text
[car][sle] rx forward
[car] control apply motion=...
```

7. 再发送 `stop`，确认小车停止。

## 小车侧回调分析

小车 `sle_client.c` 中：
- `car_sle_notification_cbk` 和 `car_sle_indication_cbk` 均已注册
- notification 回调中先检查 `status != ERRCODE_SUCC`，再调用 `car_sle_apply_rx_text`
- `car_sle_apply_rx_text` 打印 `[car][sle] rx %s`，然后用 `strstr` 匹配命令
- 该回调**从未触发**（COM6 无 `[car][sle] rx` 输出）

## 怀疑方向

以下方向降为次要排查项，只有在恢复 notify property 后仍失败时再验证：

1. **CCCD 订阅问题** — 小车 discovery 后没有显式写 CCCD 订阅通知。但原始 `sle_uart_server` 样例中同样没写 CCCD，测试却通过了（参见技术链路文档第 8.2 节）。
2. **conn_id=0 问题** — 当前 `conn_id=0` 是 SLE 框架分配的合法连接 ID；日志中 pair handle 使用 `conn_id + 1` 只是本工程的连接状态哨兵，不应先改 conn_id。
3. **服务端 `ssaps_send_response` 问题** — 小车上报 telemetry 使用的是 `ssapc_write_cmd`，BearPi 已能持续收到遥测；该方向不能解释 BearPi notify property 无效。
4. **UDP 任务上下文问题** — 只有在恢复官方 notify 属性声明后仍失败，才需要验证 `ssaps_notify_indicate` 是否对调用上下文敏感。

## 原始工作测试参考

技术链路文档中记录的已验证链路：
```
BearPi COM5 输入控制命令 -> SLE -> 小车 client -> 电机控制
小车 telemetry JSON -> SLE -> BearPi server -> COM5 串口打印
```

当时 BearPi 运行的是官方 `sle_uart_server` 样例（未经修改），使用 UART RX → `sle_uart_server_send_report_by_handle` → `ssaps_notify_indicate`。该路径测试通过。

## 待验证方案

1. 优先恢复 BearPi 网关 property notify 声明，并重新编译烧录。
2. 若仍失败，再把 `udp_bridge.c` 临时改为 `sle_uart_server_send_report_by_handle()`，确认 handle 与 uuid 两种发送方式表现是否一致。
3. 若仍失败，再临时保留 UDP 接收，但把 SLE 发送投递到 SLE server task 的消息队列中执行，排除 UDP task 调用上下文问题。
4. 最后才考虑小车端显式写 CCCD。此项不是首选，因为官方 server 样例已证明当前小车 client 能在不显式写 CCCD 的情况下接收通知。

## 文件位置

- BearPi 网关：`vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/`
- 小车 SLE 客户端：`src/application/samples/Farsight/ws63e_env_patrol_car/comm/sle_client.c`
- 小车 SSAP 回调：`sle_client.c:256-271`
- BearPi SLE 服务端：`sle_uart_server.c:288-301`（send_report_by_handle）
