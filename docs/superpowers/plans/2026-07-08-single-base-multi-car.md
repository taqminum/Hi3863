# Single Base Station Multi-Car Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an exhibition-ready one-base-station multi-car system where one BearPi / SLE base station can distinguish multiple WS63E cars, cache each car's telemetry separately, and route cloud/Web/APK control commands to the selected car by `deviceId`.

**Architecture:** Keep the cloud API's existing `deviceId/baseStationId` model and change the base-station side from a single-car relay into a small routing gateway. Each car identifies itself with a stable `deviceId`; BearPi maps `deviceId -> SLE conn_id`, stores per-car telemetry, and forwards only the target command payload to the target car. PC bridge scripts remain the cloud adapter until true BearPi direct-cloud upload is added.

**Tech Stack:** WS63E car firmware C, BearPi H3863 gateway C, Node.js bridge scripts, Node.js cloud API with SQLite, React/Capacitor Web/APK.

## Global Constraints

- Target topology is one base station with multiple cars: `sle-base-001 -> ws63-car-001/ws63-car-002/...`.
- Do not change the formal cloud API base station identity for the first version; all cars remain under `baseStationId = "sle-base-001"`.
- Do not implement autonomous scheduling, collision avoidance, formation control, or path planning in this phase.
- Do not require cloud server access or real production `DEVICE_INGEST_KEY`; cloud deployment remains paused.
- Codex must not compile firmware, flash firmware, or operate hardware. The user performs all firmware build, flashing, and hardware validation steps.
- Keep single-car compatibility: if only one car is connected and no `deviceId` is provided, default behavior should continue to target `ws63-car-001`.
- Keep car-side command payloads simple. BearPi may receive an outer routing envelope, but the car should receive the inner command it already parses, such as `{"cmd":"drive","left":70,"right":0,"duration_ms":350}`.
- All software changes must preserve existing tests: `npm run test`, bridge tests, and `npm run check:app-parity`.
- Hardware validation evidence must come from user-run serial logs and field tests.

---

## Current State Summary

The cloud and Web/APK layers already carry most multi-car identifiers:

- `apps/server/src/db.ts` has `devices`, `base_stations`, `sensor_readings`, `control_commands`, and `patrol_tasks`.
- Commands, readings, and patrol tasks already store `device_id` and `base_station_id`.
- `apps/web/src/WebConsoleApp.tsx` and `apps/web/src/mobile/MobileConsoleApp.tsx` already keep `selectedDeviceId`.
- `deploy/cloud-bridge-cli.mjs` accepts `--device-id` and `--base-station-id`.
- `deploy/cloud-control-bridge-lib.mjs` pulls all pending commands for one base station, and each command row includes `device_id`.

The BearPi gateway is still single-car:

- `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.c` keeps one `g_sle_conn_hdl`.
- `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.c` stores one latest telemetry JSON.
- `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/udp_bridge.c` forwards every non-query UDP payload to the single current SLE connection.

The plan below changes only what is required for one-base multi-car routing.

---

## Protocol Contract

### Car Identity

Each car must have a stable `deviceId`.

Recommended IDs:

```text
ws63-car-001
ws63-car-002
ws63-car-003
```

Each car should expose the ID in both ways:

1. Include `deviceId` in every telemetry JSON:

```json
{"deviceId":"ws63-car-002","seq":3943,"temp_x10":310,"humi_x10":591,"light_x10":256,"motion":1,"patrol":0,"err":0}
```

2. Send a hello frame after SLE connects, and repeat every 3 to 5 seconds until telemetry is flowing:

```json
{"type":"hello","deviceId":"ws63-car-002"}
```

The hello frame lets BearPi bind `conn_id` before the first telemetry sample arrives. Telemetry still acts as a fallback binding source.

### UDP Query Protocol From PC/App To BearPi

Keep existing queries:

```text
GET
get
DATA
data
```

Add explicit multi-car queries:

```text
LIST
GET ws63-car-001
GET ws63-car-002
```

Expected responses:

```json
{"baseStationId":"sle-base-001","devices":[{"deviceId":"ws63-car-001","online":true},{"deviceId":"ws63-car-002","online":true}]}
```

```json
{"deviceId":"ws63-car-002","seq":3943,"temp_x10":310,"humi_x10":591,"light_x10":256,"motion":1,"patrol":0,"err":0}
```

For legacy `GET`, return the first ready telemetry record. This preserves the existing `bridge:cloud --device-id ws63-car-001` behavior.

### UDP Control Protocol From PC/App To BearPi

Add a routing envelope:

```json
{
  "deviceId": "ws63-car-002",
  "payload": {"cmd":"drive","left":70,"right":0,"duration_ms":350}
}
```

BearPi must:

1. Parse `deviceId`.
2. Find the SLE connection bound to that device.
3. Serialize and forward only the inner `payload` to the car:

```json
{"cmd":"drive","left":70,"right":0,"duration_ms":350}
```

If the UDP payload is an old single-car command without `deviceId`, BearPi should route it to the default car:

```text
ws63-car-001
```

### Cloud Telemetry Upload

The cloud ingest endpoint already supports batch telemetry:

```json
{
  "batchId": "sle-base-001-1783496024",
  "sequence": 1783496024,
  "link": {"mode":"sle","rssi":-52,"cachedCount":0},
  "devices": [
    {"deviceId":"ws63-car-001","temperature":31.0,"humidity":59.1,"lightness":256,"direction":"forward","status":"moving"},
    {"deviceId":"ws63-car-002","temperature":30.2,"humidity":58.5,"lightness":260,"direction":"stop","status":"idle"}
  ]
}
```

The bridge can build this from BearPi `LIST` plus `GET <deviceId>` responses.

---

## File Structure

### Car Firmware

- Modify `src/application/samples/Farsight/ws63e_env_patrol_car/comm/telemetry.*`
  Add `deviceId` to telemetry output.
- Modify `src/application/samples/Farsight/ws63e_env_patrol_car/comm/sle_client.c`
  Send hello frame after SLE connection.
- Modify a local config header if one already exists; otherwise create `src/application/samples/Farsight/ws63e_env_patrol_car/config/car_identity.h`
  Define `CAR_DEVICE_ID`.
- Modify `src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md`
  Document the hello and telemetry identity fields.

Codex writes and reviews source changes only. The user builds and flashes car firmware.

### BearPi Gateway Firmware

- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.h`
  Replace single-connection API with targetable send helpers.
- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.c`
  Track multiple `conn_id` values and expose send-to-connection.
- Create `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/device_registry.h`
  Public API for `deviceId -> conn_id` binding and lookup.
- Create `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/device_registry.c`
  Fixed-size in-memory registry for connected cars.
- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.h`
  Add per-device cache APIs.
- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.c`
  Store latest telemetry per `deviceId`.
- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/gateway_main.c`
  Bind telemetry/hello frames to the correct SLE connection.
- Modify `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/udp_bridge.c`
  Support `LIST`, `GET <deviceId>`, and control envelope routing.
- Modify the BearPi product `CMakeLists.txt` or build list if new `.c` files must be added.

Codex writes and reviews source changes only. The user copies to the real BearPi SDK if needed, then builds and flashes.

### PC Bridge Scripts

- Modify `deploy/cloud-bridge-lib.mjs`
  Add multi-device polling from `LIST` and `GET <deviceId>`.
- Modify `deploy/cloud-bridge-cli.mjs`
  Add `--multi-device`, `--device-ids`, and `--list-command`.
- Modify `deploy/cloud-control-bridge-lib.mjs`
  Send routed UDP envelope containing `deviceId` and parsed `payload`.
- Modify `deploy/cloud-patrol-bridge-lib.mjs`
  Send routed UDP envelope for each patrol step.
- Add/modify tests:
  - `deploy/cloud-bridge.test.mjs`
  - `deploy/cloud-control-bridge.test.mjs`
  - `deploy/cloud-patrol-bridge.test.mjs`

### Cloud API And Web/APK

- Modify `apps/server/src/db.ts`
  Seed `ws63-car-002` and optionally `ws63-car-003`, all bound to `sle-base-001`.
- Modify tests under `apps/server/tests`
  Prove command, telemetry, readings, and patrol isolation across multiple cars on one base station.
- Check `apps/web/src/WebConsoleApp.tsx`, `apps/web/src/mobile/MobileConsoleApp.tsx`, `apps/web/src/views/Control.tsx`, `apps/web/src/views/Patrol.tsx`, and `apps/web/src/views/HistoryView.tsx`
  Confirm no hard-coded `ws63-car-001` blocks selected-device behavior.
- Add or update Web tests if a hard-coded fallback affects multi-car selection.

### Documentation

- Modify `deploy/base-station-api.md`
  Add one-base multi-car UDP and cloud bridge protocol.
- Modify `deploy/README.md`
  Add local multi-car bridge commands and user-run hardware validation checklist.
- Modify `docs/local_test_route.md`
  Add one-base multi-car test route.

---

## Task 1: Lock The Multi-Car Identity Contract

**Files:**
- Modify: `src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md`
- Modify: `deploy/base-station-api.md`
- Modify: `docs/local_test_route.md`

**Interfaces:**
- Produces: the canonical `deviceId`, hello frame, telemetry identity, UDP query, and UDP control envelope contract used by all later tasks.

- [ ] **Step 1: Document device IDs**

Add this exact ID convention to the docs:

```text
Default base station: sle-base-001
Default cars:
- ws63-car-001
- ws63-car-002
- ws63-car-003
```

- [ ] **Step 2: Document car hello frame**

Add:

```json
{"type":"hello","deviceId":"ws63-car-002"}
```

State that hello is sent by the car after SLE connection and repeated until normal telemetry has been observed.

- [ ] **Step 3: Document telemetry identity**

Add:

```json
{"deviceId":"ws63-car-002","seq":3943,"temp_x10":310,"humi_x10":591,"light_x10":256,"motion":1,"patrol":0,"err":0}
```

- [ ] **Step 4: Document UDP multi-car queries**

Add:

```text
LIST
GET ws63-car-001
GET ws63-car-002
```

- [ ] **Step 5: Document routed control envelope**

Add:

```json
{"deviceId":"ws63-car-002","payload":{"cmd":"drive","left":70,"right":0,"duration_ms":350}}
```

Explain that BearPi forwards only the inner `payload` JSON to the target car.

- [ ] **Step 6: Verify docs contain no ambiguous routing**

Run:

```powershell
rg -n "one base|multi-car|deviceId|hello|LIST|GET ws63|payload" deploy docs src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md
```

Expected: the new protocol appears in all three documentation targets.

- [ ] **Step 7: Commit**

```powershell
git add src/application/samples/Farsight/ws63e_env_patrol_car/comm/CONTROL.md deploy/base-station-api.md docs/local_test_route.md
git commit -m "Document one-base multi-car protocol"
```

---

## Task 2: Add Car Device Identity To WS63E Telemetry

**Files:**
- Create or modify: `src/application/samples/Farsight/ws63e_env_patrol_car/config/car_identity.h`
- Modify: `src/application/samples/Farsight/ws63e_env_patrol_car/comm/telemetry.c`
- Modify: `src/application/samples/Farsight/ws63e_env_patrol_car/comm/telemetry.h` if telemetry buffer sizing or prototypes need updating.

**Interfaces:**
- Consumes: `CAR_DEVICE_ID`.
- Produces: telemetry JSON with `deviceId`.

- [ ] **Step 1: Add identity config**

Create this header if no equivalent car config exists:

```c
#ifndef CAR_IDENTITY_H
#define CAR_IDENTITY_H

#define CAR_DEVICE_ID "ws63-car-001"

#endif
```

For the second physical car, the user will change this value to:

```c
#define CAR_DEVICE_ID "ws63-car-002"
```

before compiling and flashing that car.

- [ ] **Step 2: Update telemetry JSON format**

Change the telemetry builder so output includes:

```json
"deviceId":"ws63-car-001"
```

The resulting JSON must keep existing fields:

```json
{"deviceId":"ws63-car-001","seq":1,"temp_x10":253,"humi_x10":618,"light_x10":845,"motion":0,"patrol":0,"err":0}
```

- [ ] **Step 3: Check buffer size**

Increase telemetry output buffer by at least 32 bytes if the current buffer is tight. The JSON above is longer than the old payload.

- [ ] **Step 4: Source-level verification only**

Codex runs text checks only:

```powershell
rg -n "CAR_DEVICE_ID|deviceId|temp_x10|humi_x10|light_x10" src/application/samples/Farsight/ws63e_env_patrol_car
```

Expected: `CAR_DEVICE_ID` is included by telemetry code and appears in the JSON builder.

- [ ] **Step 5: User-run build and flash**

The user runs the firmware build and flashing process. Codex does not run these commands.

User expected build target:

```powershell
Set-Location G:\fbb_ws63_20260226\src
python build.py -component=ws63e_env_patrol_car ws63-liteos-app
```

User expected flash artifact:

```text
G:\fbb_ws63_20260226\src\output\ws63\fwpkg\ws63-liteos-app\ws63-liteos-app_all.fwpkg
```

- [ ] **Step 6: User-run serial validation**

The user confirms car serial output contains:

```text
"deviceId":"ws63-car-001"
```

and, after changing `CAR_DEVICE_ID` and flashing the second car:

```text
"deviceId":"ws63-car-002"
```

- [ ] **Step 7: Commit**

```powershell
git add src/application/samples/Farsight/ws63e_env_patrol_car
git commit -m "Add car telemetry identity"
```

---

## Task 3: Add Car Hello Frame On SLE Connect

**Files:**
- Modify: `src/application/samples/Farsight/ws63e_env_patrol_car/comm/sle_client.c`
- Modify: `src/application/samples/Farsight/ws63e_env_patrol_car/config/car_identity.h`

**Interfaces:**
- Consumes: `CAR_DEVICE_ID`.
- Produces: SLE hello frame `{"type":"hello","deviceId":"..."}`.

- [ ] **Step 1: Locate SLE connected callback**

Find the code path that logs SLE connection success:

```powershell
rg -n "connect|connected|SLE_ACB_STATE_CONNECTED|sle.*rx|send|notify|write" src/application/samples/Farsight/ws63e_env_patrol_car/comm/sle_client.c
```

- [ ] **Step 2: Add hello builder**

Add a small helper near the SLE send helpers:

```c
static void car_sle_send_hello(void)
{
    char hello[96] = {0};
    int len = snprintf(hello, sizeof(hello),
        "{\"type\":\"hello\",\"deviceId\":\"%s\"}", CAR_DEVICE_ID);
    if (len <= 0 || len >= (int)sizeof(hello)) {
        return;
    }
    car_sle_send((const uint8_t *)hello, (uint16_t)len);
}
```

Use the existing send function name in this file. If the existing function is not named `car_sle_send`, replace that call with the actual local SLE write helper.

- [ ] **Step 3: Call hello after connection**

After SLE connection becomes active, call:

```c
car_sle_send_hello();
```

If connection timing is unreliable, also send hello from the telemetry loop until a normal telemetry write succeeds.

- [ ] **Step 4: Source-level verification only**

Codex runs:

```powershell
rg -n "type.*hello|CAR_DEVICE_ID|car_sle_send_hello" src/application/samples/Farsight/ws63e_env_patrol_car/comm/sle_client.c
```

Expected: helper and connection call are present.

- [ ] **Step 5: User-run build, flash, and serial validation**

The user builds and flashes. Codex does not run compile or flash commands.

User expected BearPi or car serial log:

```text
{"type":"hello","deviceId":"ws63-car-001"}
{"type":"hello","deviceId":"ws63-car-002"}
```

- [ ] **Step 6: Commit**

```powershell
git add src/application/samples/Farsight/ws63e_env_patrol_car
git commit -m "Send car SLE identity hello"
```

---

## Task 4: Add BearPi Device Registry

**Files:**
- Create: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/device_registry.h`
- Create: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/device_registry.c`
- Modify: BearPi product build file if required to compile `device_registry.c`.

**Interfaces:**
- Produces:
  - `void device_registry_init(void);`
  - `void device_registry_bind(const char *device_id, uint16_t conn_id);`
  - `void device_registry_remove_conn(uint16_t conn_id);`
  - `int device_registry_find_conn(const char *device_id, uint16_t *out_conn_id);`
  - `int device_registry_list_json(char *buf, uint16_t buf_size);`

- [ ] **Step 1: Create fixed-size registry header**

Use this API:

```c
#ifndef DEVICE_REGISTRY_H
#define DEVICE_REGISTRY_H

#include <stdint.h>

#define DEVICE_REGISTRY_MAX_CARS 4
#define DEVICE_ID_MAX_LEN 32

void device_registry_init(void);
void device_registry_bind(const char *device_id, uint16_t conn_id);
void device_registry_remove_conn(uint16_t conn_id);
int device_registry_find_conn(const char *device_id, uint16_t *out_conn_id);
int device_registry_list_json(char *buf, uint16_t buf_size);

#endif
```

- [ ] **Step 2: Implement fixed slots**

Implementation requirements:

- Use a static array of 4 entries.
- Each entry stores `device_id`, `conn_id`, `online`, and `last_seen_ms` if a monotonic tick helper exists.
- `device_registry_bind` updates existing device first, then reuses a disconnected slot, then overwrites the oldest slot.
- `device_registry_remove_conn` marks entries with matching `conn_id` offline.
- `device_registry_find_conn` returns `1` if online and found, `0` otherwise.
- `device_registry_list_json` returns:

```json
{"baseStationId":"sle-base-001","devices":[{"deviceId":"ws63-car-001","online":true},{"deviceId":"ws63-car-002","online":true}]}
```

- [ ] **Step 3: Add build integration**

Add `device_registry.c` to the BearPi product source list next to `telemetry_cache.c` and `udp_bridge.c`.

- [ ] **Step 4: Source-level verification only**

Codex runs:

```powershell
rg -n "device_registry|DEVICE_REGISTRY_MAX_CARS|device_registry_bind|device_registry_find_conn" vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
```

Expected: header, implementation, and build list references exist.

- [ ] **Step 5: User-run BearPi build**

The user builds BearPi firmware in the real BearPi SDK workspace. Codex does not run the build.

Expected result: BearPi firmware compiles with `device_registry.c`.

- [ ] **Step 6: Commit**

```powershell
git add vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
git commit -m "Add gateway device registry"
```

---

## Task 5: Convert BearPi SLE Server From Single Connection To Targetable Connections

**Files:**
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.h`
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.c`

**Interfaces:**
- Consumes: `device_registry_remove_conn(conn_id)` from Task 4.
- Produces:
  - `errcode_t sle_uart_server_send_report_to_conn(uint16_t conn_id, const uint8_t *data, uint16_t len);`
  - Existing single-car helpers remain for fallback.

- [ ] **Step 1: Add targetable send declaration**

Add to `sle_uart_server.h`:

```c
errcode_t sle_uart_server_send_report_to_conn(uint16_t conn_id, const uint8_t *data, uint16_t len);
```

- [ ] **Step 2: Implement targetable send**

Extract the existing notify logic from `sle_uart_server_send_report_by_uuid` and pass `conn_id` as an argument:

```c
errcode_t sle_uart_server_send_report_to_conn(uint16_t conn_id, const uint8_t *data, uint16_t len)
{
    ssaps_ntf_ind_by_uuid_t param = {0};
    errcode_t ret;

    if (data == NULL || len == 0) {
        return ERRCODE_FAIL;
    }

    param.type = SSAP_PROPERTY_TYPE_VALUE;
    param.start_handle = g_service_handle;
    param.end_handle = g_property_handle;
    param.value = (uint8_t *)data;
    param.value_len = len;
    sle_uuid_setu2(SLE_UUID_SERVER_NTF_REPORT, &param.uuid);

    ret = ssaps_notify_indicate_by_uuid(g_server_id, conn_id, &param);
    return ret;
}
```

Use the actual handle variable names already present in `sle_uart_server.c`. If this SDK requires the old helper struct fields, keep the existing field names and only replace `g_sle_conn_hdl` with `conn_id`.

- [ ] **Step 3: Keep old helper as fallback**

Change existing `sle_uart_server_send_report_by_uuid` to call:

```c
return sle_uart_server_send_report_to_conn(g_sle_conn_hdl, data, len);
```

- [ ] **Step 4: Keep latest connection for legacy mode**

On connect, keep assigning `g_sle_conn_hdl = conn_id` so old single-car behavior still works.

- [ ] **Step 5: Remove registry entry on disconnect**

In disconnected callback:

```c
device_registry_remove_conn(conn_id);
```

- [ ] **Step 6: User-run BearPi build and serial validation**

The user builds and flashes. Codex does not build or flash.

Expected serial logs when two cars connect:

```text
[sle uart server] connect state changed callback conn_id:0x00
[sle uart server] connect state changed callback conn_id:0x01
```

- [ ] **Step 7: Commit**

```powershell
git add vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/sle_uart_server.*
git commit -m "Support targetable SLE sends"
```

---

## Task 6: Convert BearPi Telemetry Cache To Per-Device Cache

**Files:**
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.h`
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.c`

**Interfaces:**
- Produces:
  - `void telemetry_cache_update_device(const char *device_id, const uint8_t *data, uint16_t len);`
  - `int telemetry_cache_get_device(const char *device_id, char *buf, uint16_t buf_size);`
  - `int telemetry_cache_get_any(char *buf, uint16_t buf_size);`
  - `int telemetry_cache_list_json(char *buf, uint16_t buf_size);`
- Keeps existing `telemetry_cache_update`, `telemetry_cache_get`, and `telemetry_cache_is_ready` as single-car fallback wrappers.

- [ ] **Step 1: Extend header**

Add:

```c
void telemetry_cache_update_device(const char *device_id, const uint8_t *data, uint16_t len);
int telemetry_cache_get_device(const char *device_id, char *buf, uint16_t buf_size);
int telemetry_cache_get_any(char *buf, uint16_t buf_size);
int telemetry_cache_list_json(char *buf, uint16_t buf_size);
```

- [ ] **Step 2: Implement fixed per-device slots**

Implementation requirements:

- Use 4 slots to match `DEVICE_REGISTRY_MAX_CARS`.
- Store `device_id`, raw telemetry JSON, `ready`, and optional `last_seen_ms`.
- `telemetry_cache_update_device` updates matching device first, then empty slot, then oldest slot.
- `telemetry_cache_get_device` returns raw telemetry JSON for that device.
- `telemetry_cache_get_any` returns the first ready telemetry.
- Existing `telemetry_cache_update(data, len)` updates `ws63-car-001`.
- Existing `telemetry_cache_get(buf, size)` calls `telemetry_cache_get_any`.

- [ ] **Step 3: Add list response**

`telemetry_cache_list_json` returns:

```json
{"devices":[{"deviceId":"ws63-car-001","ready":true},{"deviceId":"ws63-car-002","ready":true}]}
```

- [ ] **Step 4: Source-level verification only**

Codex runs:

```powershell
rg -n "telemetry_cache_update_device|telemetry_cache_get_device|telemetry_cache_get_any|telemetry_cache_list_json" vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
```

- [ ] **Step 5: User-run BearPi build**

The user builds BearPi firmware. Codex does not build firmware.

- [ ] **Step 6: Commit**

```powershell
git add vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.*
git commit -m "Cache gateway telemetry per car"
```

---

## Task 7: Bind Incoming SLE Frames To Device IDs

**Files:**
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/gateway_main.c`
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/device_registry.c`
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/telemetry_cache.c`

**Interfaces:**
- Consumes: hello frame and telemetry `deviceId`.
- Produces: correct binding from `deviceId` to SLE `conn_id` and per-device telemetry cache update.

- [ ] **Step 1: Add a small JSON deviceId extractor**

Because firmware has no full JSON library here, implement a constrained extractor:

```c
static int gateway_extract_device_id(const uint8_t *data, uint16_t len, char *out, uint16_t out_size)
{
    const char *key = "\"deviceId\":\"";
    const char *start = NULL;
    const char *end = NULL;
    char *text = (char *)data;

    if (data == NULL || out == NULL || out_size == 0) {
        return 0;
    }
    start = strstr(text, key);
    if (start == NULL) {
        return 0;
    }
    start += strlen(key);
    end = strchr(start, '"');
    if (end == NULL || end <= start || (uint16_t)(end - start) >= out_size) {
        return 0;
    }
    (void)memcpy_s(out, out_size, start, (uint32_t)(end - start));
    out[end - start] = '\0';
    return 1;
}
```

This parser only supports the documented compact JSON shape. That is acceptable for the first hardware phase.

- [ ] **Step 2: Bind on hello or telemetry**

In `gateway_write_request_cbk`, after receiving SLE data:

```c
char device_id[DEVICE_ID_MAX_LEN] = {0};
if (gateway_extract_device_id(write_cb_para->value, write_cb_para->length, device_id, sizeof(device_id))) {
    device_registry_bind(device_id, conn_id);
    telemetry_cache_update_device(device_id, write_cb_para->value, write_cb_para->length);
} else {
    telemetry_cache_update(write_cb_para->value, write_cb_para->length);
}
```

- [ ] **Step 3: Do not cache pure hello as telemetry**

If frame contains `"type":"hello"`, bind the registry but do not update telemetry cache. The cache should represent sensor readings only.

Expected logic:

```c
if (strstr((const char *)write_cb_para->value, "\"type\":\"hello\"") != NULL) {
    device_registry_bind(device_id, conn_id);
    return;
}
```

- [ ] **Step 4: User-run serial validation**

After the user builds/flashes BearPi and cars, expected BearPi logs:

```text
[gateway] rx telemetry: {"type":"hello","deviceId":"ws63-car-001"}
[gateway] bind device ws63-car-001 conn_id=0
[gateway] rx telemetry: {"type":"hello","deviceId":"ws63-car-002"}
[gateway] bind device ws63-car-002 conn_id=1
```

- [ ] **Step 5: Commit**

```powershell
git add vendor/BearPi-Pico_H3863/products/ws63e_env_gateway
git commit -m "Bind gateway telemetry to car identities"
```

---

## Task 8: Route UDP Queries And Commands By Device ID

**Files:**
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/udp_bridge.c`
- Modify: `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/udp_bridge.h` if helper declarations are needed.

**Interfaces:**
- Consumes: `device_registry_find_conn`, `device_registry_list_json`, `telemetry_cache_get_device`, `telemetry_cache_get_any`.
- Produces: `LIST`, `GET <deviceId>`, and routed control envelope behavior.

- [ ] **Step 1: Recognize LIST**

Add:

```c
static int udp_bridge_is_list_query(const char *payload)
{
    return payload != NULL && (strcmp(payload, "LIST") == 0 || strcmp(payload, "list") == 0);
}
```

- [ ] **Step 2: Recognize GET target**

Add:

```c
static int udp_bridge_parse_get_device(const char *payload, char *device_id, uint16_t device_id_size)
{
    const char *prefix = "GET ";
    if (payload == NULL || strncmp(payload, prefix, strlen(prefix)) != 0) {
        return 0;
    }
    if (strlen(payload + strlen(prefix)) >= device_id_size) {
        return 0;
    }
    (void)strcpy_s(device_id, device_id_size, payload + strlen(prefix));
    return 1;
}
```

- [ ] **Step 3: Parse routed control envelope**

Add constrained extraction helpers:

```text
deviceId extractor: find "deviceId":"..."
payload extractor: find "payload": then copy the object from the first { to its matching }
```

The input:

```json
{"deviceId":"ws63-car-002","payload":{"cmd":"stop","speed":0,"duration_ms":0}}
```

must produce:

```text
device_id = ws63-car-002
inner_payload = {"cmd":"stop","speed":0,"duration_ms":0}
```

- [ ] **Step 4: Route command to matching SLE connection**

Replace the old single send path:

```c
errcode_t ret = sle_uart_server_send_report_by_uuid((const uint8_t *)recv_buf, (uint8_t)n);
```

with:

```c
uint16_t target_conn = 0;
if (device_registry_find_conn(device_id, &target_conn)) {
    errcode_t ret = sle_uart_server_send_report_to_conn(target_conn,
        (const uint8_t *)inner_payload, (uint16_t)strlen(inner_payload));
    osal_printk("%s routed %s to conn_id=%u ret=%d\r\n", UDP_BRIDGE_LOG, device_id, target_conn, ret);
} else {
    osal_printk("%s target device %s not connected\r\n", UDP_BRIDGE_LOG, device_id);
}
```

- [ ] **Step 5: Preserve legacy single-car behavior**

If no envelope is present, use:

```text
deviceId = ws63-car-001
inner_payload = original recv_buf
```

- [ ] **Step 6: Reply with target telemetry**

Response rules:

- `LIST` -> registry/list JSON
- `GET ws63-car-002` -> telemetry for `ws63-car-002`
- old `GET` -> any ready telemetry
- control envelope -> telemetry for target device if available

- [ ] **Step 7: User-run BearPi build and UDP validation**

The user builds/flashes BearPi. Codex does not build or flash.

User PC validation examples:

```powershell
npm run bridge:cloud -- --cloud-base-url http://127.0.0.1:8787 --gateway-host 192.168.5.118 --gateway-port 8888 --timeout-ms 5000 --once
```

Manual UDP payloads may be sent using a temporary script or existing bridge code.

Expected BearPi log:

```text
[udp_bridge] routed ws63-car-002 to conn_id=1 ret=0
```

- [ ] **Step 8: Commit**

```powershell
git add vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/udp_bridge.*
git commit -m "Route gateway UDP by car identity"
```

---

## Task 9: Add Multi-Car Cloud Bridge Telemetry Upload

**Files:**
- Modify: `deploy/cloud-bridge-cli.mjs`
- Modify: `deploy/cloud-bridge-lib.mjs`
- Modify: `deploy/cloud-bridge.test.mjs`

**Interfaces:**
- Consumes: BearPi `LIST` and `GET <deviceId>` UDP protocol.
- Produces: one cloud telemetry batch containing multiple `devices`.

- [ ] **Step 1: Add CLI options**

Add:

```text
--multi-device
--device-ids ws63-car-001,ws63-car-002
--list-command LIST
```

Default remains single-car mode.

- [ ] **Step 2: Add parser for LIST response**

Test input:

```json
{"baseStationId":"sle-base-001","devices":[{"deviceId":"ws63-car-001","online":true},{"deviceId":"ws63-car-002","online":true}]}
```

Expected output:

```js
["ws63-car-001", "ws63-car-002"]
```

- [ ] **Step 3: Poll each device**

In multi-device mode:

1. Send `LIST`.
2. For each online `deviceId`, send `GET <deviceId>`.
3. Convert each raw telemetry frame to cloud device telemetry.
4. POST one `devices` batch to:

```text
/api/ingest/base-stations/sle-base-001/telemetry
```

- [ ] **Step 4: Add tests**

Add tests that prove:

- Single-car mode still uploads one device.
- Multi-car mode uploads `ws63-car-001` and `ws63-car-002` in one request.
- Offline device from `LIST` is skipped.
- Missing `deviceId` in raw telemetry is filled from `GET <deviceId>`.

- [ ] **Step 5: Run bridge tests**

```powershell
node --experimental-sqlite --experimental-strip-types --test deploy/cloud-bridge.test.mjs
```

Expected: all `cloud-bridge` tests pass.

- [ ] **Step 6: Commit**

```powershell
git add deploy/cloud-bridge-cli.mjs deploy/cloud-bridge-lib.mjs deploy/cloud-bridge.test.mjs
git commit -m "Upload multi-car gateway telemetry"
```

---

## Task 10: Route Cloud Control And Patrol Bridge Commands

**Files:**
- Modify: `deploy/cloud-control-bridge-lib.mjs`
- Modify: `deploy/cloud-control-bridge.test.mjs`
- Modify: `deploy/cloud-patrol-bridge-lib.mjs`
- Modify: `deploy/cloud-patrol-bridge.test.mjs`

**Interfaces:**
- Consumes: cloud pending command rows with `device_id`.
- Produces: BearPi UDP routed control envelopes.

- [ ] **Step 1: Wrap pending command payloads**

When a pending command row is:

```json
{"device_id":"ws63-car-002","payload":"{\"cmd\":\"stop\",\"speed\":0,\"duration_ms\":0}"}
```

Send this UDP payload to BearPi:

```json
{"deviceId":"ws63-car-002","payload":{"cmd":"stop","speed":0,"duration_ms":0}}
```

- [ ] **Step 2: Keep fallback for malformed payloads**

If `payload` is not JSON, wrap it as text:

```json
{"deviceId":"ws63-car-002","payload":"STOP:0"}
```

BearPi can reject unsupported text routing later; the bridge should not crash.

- [ ] **Step 3: Wrap patrol steps**

For a patrol task belonging to `ws63-car-002`, every step sent to BearPi must be:

```json
{"deviceId":"ws63-car-002","payload":{"cmd":"forward","speed":35,"duration_ms":600}}
```

- [ ] **Step 4: Add tests**

Add tests that prove:

- Control bridge sends `deviceId` from `command.device_id`.
- Patrol bridge sends `deviceId` from `task.device_id`.
- Ack behavior remains unchanged.

- [ ] **Step 5: Run bridge tests**

```powershell
node --experimental-sqlite --experimental-strip-types --test deploy/cloud-control-bridge.test.mjs deploy/cloud-patrol-bridge.test.mjs
```

Expected: all control and patrol bridge tests pass.

- [ ] **Step 6: Commit**

```powershell
git add deploy/cloud-control-bridge-lib.mjs deploy/cloud-control-bridge.test.mjs deploy/cloud-patrol-bridge-lib.mjs deploy/cloud-patrol-bridge.test.mjs
git commit -m "Route bridge commands by car identity"
```

---

## Task 11: Seed Multiple Cars Under One Base Station

**Files:**
- Modify: `apps/server/src/db.ts`
- Modify: `apps/server/tests/api.test.ts`
- Modify: `apps/server/tests/telemetry-ingest.test.ts`
- Modify: `apps/server/tests/commands.test.ts`
- Modify: `apps/server/tests/patrol.test.ts`

**Interfaces:**
- Produces: default devices `ws63-car-001` and `ws63-car-002` under `sle-base-001`.

- [ ] **Step 1: Add default second car**

In `seedDefaults`, insert:

```ts
db.prepare(
  `INSERT OR IGNORE INTO devices (id, name, base_station_id, status, connection_mode, direct_url, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run("ws63-car-002", "WS63 环境巡检小车 002", "sle-base-001", "offline", "sle-gateway", "", nowIso());
```

Optional third car:

```ts
db.prepare(
  `INSERT OR IGNORE INTO devices (id, name, base_station_id, status, connection_mode, direct_url, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run("ws63-car-003", "WS63 环境巡检小车 003", "sle-base-001", "offline", "sle-gateway", "", nowIso());
```

- [ ] **Step 2: Add telemetry isolation test**

Create a test that uploads:

```json
{
  "batchId":"multi-car-1",
  "devices":[
    {"deviceId":"ws63-car-001","temperature":26.1,"humidity":50,"lightness":500},
    {"deviceId":"ws63-car-002","temperature":31.2,"humidity":60,"lightness":700}
  ]
}
```

Expected:

- `/api/readings?deviceId=ws63-car-001` returns `26.1`.
- `/api/readings?deviceId=ws63-car-002` returns `31.2`.

- [ ] **Step 3: Add command isolation test**

Create commands for both cars under `sle-base-001`. Pull pending commands for `sle-base-001`. Expected: both commands appear, each row keeps its own `device_id`.

- [ ] **Step 4: Add patrol isolation test**

Create patrol tasks for both cars. Pull pending tasks for `sle-base-001`. Expected: both tasks appear, each row keeps its own `device_id`.

- [ ] **Step 5: Run server tests**

```powershell
npm run test --workspace apps/server
```

Expected: all server tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/src/db.ts apps/server/tests
git commit -m "Seed and test one-base multi-car data"
```

---

## Task 12: Verify Web And APK Selected-Device Isolation

**Files:**
- Inspect: `apps/web/src/WebConsoleApp.tsx`
- Inspect: `apps/web/src/mobile/MobileConsoleApp.tsx`
- Inspect: `apps/web/src/views/Control.tsx`
- Inspect: `apps/web/src/views/Patrol.tsx`
- Inspect: `apps/web/src/views/HistoryView.tsx`
- Modify tests only if inspection finds a hard-coded selected-device bug.

**Interfaces:**
- Consumes: server dashboard with multiple devices.
- Produces: evidence that Web/APK operate on selected device.

- [ ] **Step 1: Audit selected-device flow**

Run:

```powershell
rg -n "ws63-car-001|selectedDevice|selectedDeviceId|device\\.id|base_station_id" apps/web/src
```

Expected:

- Fallbacks may mention `ws63-car-001`.
- Real cloud control and patrol must use `selectedDevice.id` and `selectedDevice.base_station_id`.

- [ ] **Step 2: Add or adjust tests if needed**

If hard-coded values are found in active cloud-mode control paths, add a test around the relevant helper or component utility. The expected body must be:

```json
{"deviceId":"ws63-car-002","baseStationId":"sle-base-001","action":"drive","speed":0,"left":70,"right":0,"durationMs":350}
```

- [ ] **Step 3: Run Web tests**

```powershell
npm run test --workspace apps/web
```

Expected: Web type checks and tests pass.

- [ ] **Step 4: Run parity check**

```powershell
npm run check:app-parity
```

Expected: Web/APK configuration parity passes.

- [ ] **Step 5: Commit if changes were needed**

```powershell
git add apps/web
git commit -m "Verify selected-device control flow"
```

If no changes were needed, do not create an empty commit.

---

## Task 13: Add Local Multi-Car Smoke Route

**Files:**
- Modify: `deploy/smoke.ps1` or create `deploy/smoke-multicar.ps1`
- Modify: `docs/local_test_route.md`

**Interfaces:**
- Produces: repeatable local software test for one-base multi-car isolation.

- [ ] **Step 1: Prefer a new script**

Create `deploy/smoke-multicar.ps1` to avoid bloating the existing single-car smoke.

Parameters:

```powershell
param(
  [string]$BaseUrl = "http://127.0.0.1:8787",
  [string]$DeviceKey = $env:DEVICE_INGEST_KEY,
  [string]$BaseStationId = "sle-base-001",
  [string]$DeviceOne = "ws63-car-001",
  [string]$DeviceTwo = "ws63-car-002"
)
```

- [ ] **Step 2: Test multi-car telemetry ingest**

Script uploads one batch with two devices and asserts readings are isolated.

- [ ] **Step 3: Test multi-car command pull**

Script creates one command per car and asserts one base-station pull returns both commands with different `device_id`.

- [ ] **Step 4: Test multi-car patrol pull**

Script creates one patrol task per car and asserts one base-station pull returns both tasks with different `device_id`.

- [ ] **Step 5: Run local smoke**

User or Codex may run software-only smoke if the local server is available:

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
powershell -ExecutionPolicy Bypass -File deploy/smoke-multicar.ps1 -BaseUrl http://127.0.0.1:8787 -DeviceKey dev-base-station-key
```

Expected:

```text
Smoke multi-car: passed
```

- [ ] **Step 6: Commit**

```powershell
git add deploy/smoke-multicar.ps1 docs/local_test_route.md
git commit -m "Add multi-car smoke route"
```

---

## Task 14: User-Run Hardware Validation Checklist

**Files:**
- Modify: `docs/local_test_route.md`
- Modify: `deploy/README.md`

**Interfaces:**
- Produces: a hardware validation checklist the user can run without Codex operating flashing tools.

- [ ] **Step 1: Document car flashing sequence**

Write that the user performs:

1. Set `CAR_DEVICE_ID` to `ws63-car-001`.
2. Build WS63E car firmware.
3. Flash car 001.
4. Set `CAR_DEVICE_ID` to `ws63-car-002`.
5. Build WS63E car firmware.
6. Flash car 002.

Codex does not run build or flash commands.

- [ ] **Step 2: Document BearPi flashing sequence**

Write that the user copies the modified gateway product into the real BearPi SDK if needed, builds BearPi firmware, and flashes BearPi. Codex does not run those commands.

- [ ] **Step 3: Document expected serial logs**

Expected BearPi logs:

```text
[gateway] bind device ws63-car-001 conn_id=0
[gateway] bind device ws63-car-002 conn_id=1
[udp_bridge] routed ws63-car-001 to conn_id=0 ret=0
[udp_bridge] routed ws63-car-002 to conn_id=1 ret=0
```

- [ ] **Step 4: Document PC bridge commands**

Telemetry:

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:cloud -- `
  --cloud-base-url http://127.0.0.1:8787 `
  --gateway-host 192.168.5.118 `
  --gateway-port 8888 `
  --multi-device `
  --once
```

Control:

```powershell
$env:DEVICE_INGEST_KEY="dev-base-station-key"
npm run bridge:control -- `
  --cloud-base-url http://127.0.0.1:8787 `
  --gateway-host 192.168.5.118 `
  --gateway-port 8888 `
  --once
```

- [ ] **Step 5: Document field test matrix**

Minimum field test:

| Selected device | Command | Expected physical result |
| --- | --- | --- |
| `ws63-car-001` | `stop` | only car 001 stops |
| `ws63-car-002` | `stop` | only car 002 stops |
| `ws63-car-001` | `drive left=70 right=0` | only car 001 moves |
| `ws63-car-002` | `drive left=70 right=0` | only car 002 moves |

- [ ] **Step 6: Commit**

```powershell
git add docs/local_test_route.md deploy/README.md
git commit -m "Document multi-car hardware validation"
```

---

## Task 15: Final Software Verification

**Files:**
- No source changes unless verification exposes a bug.

**Interfaces:**
- Produces: evidence that software changes are safe before the user performs hardware work.

- [ ] **Step 1: Run full software tests**

```powershell
npm run test
```

Expected: server tests and Web checks pass.

- [ ] **Step 2: Run bridge tests**

```powershell
node --experimental-sqlite --experimental-strip-types --test deploy/cloud-control-bridge.test.mjs deploy/cloud-patrol-bridge.test.mjs deploy/cloud-bridge.test.mjs
```

Expected: all bridge tests pass.

- [ ] **Step 3: Run build**

```powershell
npm run build
```

Expected: server and Web production builds pass.

- [ ] **Step 4: Run APK parity check**

```powershell
npm run check:app-parity
```

Expected: parity check passes.

- [ ] **Step 5: Report hardware handoff**

Report:

- Software tests run and results.
- Exact files changed.
- Exact firmware build/flash steps left for the user.
- Exact serial logs the user should capture.

- [ ] **Step 6: Commit final docs or fixes**

If Task 15 required changes:

```powershell
git add <changed-files>
git commit -m "Finalize one-base multi-car support"
```

If no changes were required, do not create an empty commit.

---

## Execution Order

Recommended order:

1. Task 1: contract docs.
2. Task 2 and Task 3: car identity and hello.
3. Task 4 through Task 8: BearPi multi-car routing.
4. Task 9 and Task 10: PC bridge multi-car cloud/control/patrol.
5. Task 11 through Task 13: cloud seed, isolation tests, smoke.
6. Task 14: user-run hardware checklist docs.
7. Task 15: final software verification.

Do not begin user hardware validation until Tasks 1 through 14 are complete and Task 15 software checks pass.

---

## Risks And Decisions

- **SLE multi-connection support may be SDK-limited.** The current code and callbacks expose `conn_id`, so the first implementation should try targetable sends by `conn_id`. If the SDK or BearPi sample only supports one active client in practice, stop and record that hardware limitation before adding complexity.
- **Firmware JSON parsing is intentionally constrained.** The BearPi parser should only support the documented compact fields. This avoids pulling a JSON library into firmware.
- **Car identity flashing is manual.** The first version uses compile-time `CAR_DEVICE_ID`; the user flashes each car with its own ID. Runtime provisioning can be added later.
- **One base station means one command pull queue.** Cloud `GET /api/base-stations/sle-base-001/commands/pending` will return commands for all cars under that base. BearPi/bridge routing must preserve `device_id`.
- **Cloud deployment remains paused.** All validation starts against local `http://127.0.0.1:8787`.

---

## Self-Review

- Spec coverage: the plan covers car identity, BearPi multi-connection routing, per-car telemetry, bridge changes, server seed/isolation, Web/APK selection audit, software smoke, and user-run hardware validation.
- Placeholder scan: no implementation section relies on unspecified future work; deferred features are explicitly excluded.
- Type consistency: `deviceId` is the Web/API/UDP JSON field; `device_id` is the server database/API row field; `conn_id` is the SLE connection handle; `baseStationId` remains `sle-base-001` for all first-phase cars.

