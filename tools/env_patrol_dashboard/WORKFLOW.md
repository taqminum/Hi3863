# WS63E 环境巡检小车本地 Dashboard 联调流程

这份文档面向当前的单板 WS63E 小车阶段，用来把现有几个工具串成一条清晰的联调链路：

1. 先确认小车车端 HTTP 服务已经正常启动
2. 再启动电脑本地 Dashboard
3. 再把遥测数据送进 Dashboard
4. 最后把 Dashboard 上的控制命令桥接回小车

当前流程不依赖手机端。

## 0. 前置条件

- 小车已经烧录好当前固件，并且能正常启动
- 小车 SoftAP 能看到：`WS63E_ENV_CAR`
- 小车 HTTP 基地址：`http://192.168.5.1:8080`
- 本地 Dashboard 默认地址：`http://127.0.0.1:8763`

期望在串口里看到的车端启动日志：

```text
[car] wifi ap ready ssid=WS63E_ENV_CAR ip=192.168.5.1
[car] wifi http ready url=http://192.168.5.1:8080/api/data
```

## 1. 先验证小车车端 HTTP 是否可用

先让电脑连接到 `WS63E_ENV_CAR`，不要一上来就开一堆工具，先用联调脚本确认 `/api/data` 和 `/api/control` 这一层是否通。

执行：

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action data
```

如果返回的是遥测 JSON，说明小车车端 HTTP 服务已经起来了。

可以再补两个控制检查：

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action forward
```

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action stop
```

如果这一步都失败，优先排查小车 AP/HTTP 本身，不要先去怀疑本地 Dashboard。

## 2. 启动本地 Dashboard

如果只是看演示数据：

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --demo
```

如果要读保存好的串口日志：

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --log-file G:\fbb_ws63_20260226\logs\car_serial.log
```

浏览器打开：

```text
http://127.0.0.1:8763
```

## 3. 把遥测数据送进 Dashboard

当前有两条比较实用的路径。

### 路径 A：回放已有串口日志

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\replay_log.py G:\fbb_ws63_20260226\logs\car_serial.log
```

### 路径 B：后续 HTTP 上传或手工 POST

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8763/api/telemetry -Body '{"seq":1,"temp_x10":285,"humi_x10":624,"light_x10":3258,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}'
```

这一步正常后，Dashboard 页面上应该能看到：

- 温度、湿度、光照
- 告警徽标和趋势徽标
- 最新运动状态
- 命令草稿和命令历史

## 4. 把 Dashboard 命令桥接回小车

再开一个终端，运行桥接脚本：

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\bridge_to_car.py --dashboard-url http://127.0.0.1:8763 --car-url http://192.168.5.1:8080
```

这样 Dashboard 页面上的按钮命令就会被转发到小车车端：

- `forward`
- `backward`
- `left`
- `right`
- `stop`
- `auto_start`
- `auto_stop`

常见日志示例：

```text
[bridge] forwarded {"cmd": "forward", "speed": 35, "duration_ms": 600}
```

```text
[bridge] idle
```

```text
[bridge] error stage=dashboard detail=...
```

```text
[bridge] error stage=car detail=...
```

## 5. 一轮真实联调时推荐顺序

1. 给小车上电，观察串口启动日志
2. 让电脑连接 `WS63E_ENV_CAR`
3. 先执行 `ws63e_env_car_http_smoke.ps1 -Action data`
4. 如果遥测可达，再打开 `http://192.168.5.1:8080/`
5. 在电脑上启动本地 Dashboard
6. 通过日志回放或后续上报方式，把遥测送进 Dashboard
7. 启动 `bridge_to_car.py`
8. 先测 `stop`，再测 `forward/backward/left/right`，最后测 `auto_start`

## 6. 失败分流

哪一步失败，就优先查那一层：

- `smoke` 脚本访问 `/api/data` 失败：
  - 说明小车车端 HTTP 或 AP 侧没有准备好
- 小车根页面能打开，但本地 Dashboard 没数据：
  - 说明问题在本地 Dashboard 或遥测灌入链路
- Dashboard 数据在更新，但桥接脚本打印 `stage=car`：
  - 说明 Dashboard 侧健康，问题在小车控制接口不可达
- Dashboard 页面按钮在，但桥接脚本一直是 `idle`：
  - 说明浏览器没有把命令正确入队到 `/api/command`

## 7. 范围提醒

- 当前流程不依赖手机端
- 当前流程不包含巡线/循迹能力
- 当前流程不会使用已损坏的蜂鸣器
