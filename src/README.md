# WS63E Car Firmware Workspace

This directory contains the WS63 SDK workspace used by the environment patrol car firmware.

Project entry:

```text
ws63e_env_patrol_car.hiproj
```

Car firmware source:

```text
application/samples/Farsight/ws63e_env_patrol_car
```

Known build command:

```powershell
python build.py ws63-liteos-app
```

Generated files under `output/`, `analyzerJson/`, and `interim_binary/` are intentionally ignored by Git.
