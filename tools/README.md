# 开发环境搭建

## Windows系统环境搭建

- [HiSparkStudio工具下载及安装](HiSparkStudio工具下载及安装.md)
- [HiSparkStudio编译及烧录](HiSparkStudio编译及烧录.md)

## WSL+Ubuntu22.04系统环境搭建

- [WSL子系统开发环境搭建](WSL子系统开发环境搭建.md)
- [WSL子系统编译及烧录](WSL子系统编译及烧录.md)

## 环境搭建问题FAQ

- 如果根据文档没有编译成功，请参考https://developers.hisilicon.com/postDetail?tid=02110170392979486020
- 如果根据文档编译成功，但是在编写其他代码后，导致编译失败，可以在论坛提问，论坛链接：https://developers.hisilicon.com/forum/0133146886267870001

## WS63E 小车联调辅助

- 小车本地 Dashboard：`tools\env_patrol_dashboard`
- Dashboard 联调流程：`tools\env_patrol_dashboard\WORKFLOW.md`
- 小车 HTTP 联调脚本：`tools\ws63e_env_car_http_smoke.ps1`
- Dashboard 到小车 HTTP 控制桥：`tools\env_patrol_dashboard\bridge_to_car.py`

常用示例：

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action data
```

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action forward
```

```powershell
powershell -ExecutionPolicy Bypass -File G:\fbb_ws63_20260226\tools\ws63e_env_car_http_smoke.ps1 -Action auto_start
```

```powershell
python G:\fbb_ws63_20260226\tools\env_patrol_dashboard\bridge_to_car.py --once
```

