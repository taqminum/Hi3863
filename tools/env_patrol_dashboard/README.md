# WS63E 环境巡检小车本地 Dashboard

这是当前单板 WS63E 小车阶段配套的本地 Web 可视化与分析工具。它不替代 HiSpark Studio，也不依赖手机端。

遥测字段合同定义见：

```text
G:\fbb_ws63_20260226\src\application\samples\Farsight\ws63e_env_patrol_car\comm\PROTOCOL.md
```

## 启动方式

### 演示数据模式

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --demo
```

打开：

```text
http://127.0.0.1:8763
```

### 读取串口日志文件

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\server.py --log-file G:\fbb_ws63_20260226\logs\car_serial.log
```

日志文件中可追加类似下面的串口遥测行：

```text
[car] telemetry {"seq":8,"temp_x10":286,"humi_x10":630,"light_x10":2466,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

### 回放已有串口日志

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\replay_log.py G:\fbb_ws63_20260226\logs\car_serial.log
```

## HTTP 灌入方式

后续如果走 Wi-Fi/服务器桥接，也可以直接用 HTTP 把遥测送进本地 Dashboard：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8763/api/telemetry -Body '{"seq":1,"temp_x10":285,"humi_x10":624,"light_x10":3258,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}'
```

## 命令草稿与桥接

Dashboard 页面上的手动控制命令会先进入本地待发队列。桥接进程可以从这里取出下一条命令：

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8763/api/commands/next
```

返回命令格式与固件车端控制协议保持一致，例如：

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

预设动作序列巡检命令也使用同样风格：

```json
{"cmd":"auto_start"}
```

```json
{"cmd":"auto_stop"}
```

可以用下面这个脚本轮询本地 Dashboard，并把命令转发到小车的车端 HTTP 控制接口：

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\bridge_to_car.py --dashboard-url http://127.0.0.1:8763 --car-url http://192.168.5.1:8080
```

如果只想跑一次轮询：

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\bridge_to_car.py --once
```

如果桥接脚本连不上某一端，它会继续运行，并打印分阶段日志，例如：

- `stage=dashboard`
- `stage=car`

## 当前 Dashboard 已覆盖的命令

- `forward`
- `backward`
- `left`
- `right`
- `stop`
- `auto_start`
- `auto_stop`

## 页面当前可见内容

- 当前待发命令草稿
- 最近命令历史
- 告警徽标：`TEMP`、`HUMI`、`LIGHT`
- 趋势徽标，例如 `温度 +1.0 C`、`湿度 +3.0%RH`、`光照 -300.0 lx`
- 分析摘要与建议列表

## 功能范围

- 展示温度、湿度、光照数据
- 在内存中保留最近 300 条遥测
- 做简单阈值分析和趋势分析
- 提供后续人工遥控集成用的命令草稿面板
- 不宣称支持巡线、避障或闭环自主导航

## `GET /api/snapshot` 返回结构

浏览器页面会读取 `GET /api/snapshot`，响应内容包含：

```json
{
  "latest": {
    "seq": 8,
    "temp": 28.6,
    "humidity": 63.0,
    "light": 246.6,
    "temp_alert": 0,
    "humi_alert": 0,
    "light_alert": 0,
    "motion": 0,
    "patrol": 0,
    "err": 0
  },
  "analysis": {
    "level": "ok",
    "summary": "最新采样：28.6 C / 63.0%RH / 246.6 lx",
    "items": ["环境数据平稳，未发现明显异常。"],
    "alerts": [],
    "trends": []
  }
}
```

其中：

- `alerts` 表示当前固件侧已经触发的告警位
- `trends` 表示根据最近样本变化计算出的趋势摘要
