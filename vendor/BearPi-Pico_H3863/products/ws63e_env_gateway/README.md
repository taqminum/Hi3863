# WS63E Environment Gateway for BearPi-Pico H3863

BearPi-Pico H3863 Wi-Fi + SLE gateway firmware for the WS63E environment patrol car.

## Architecture

```text
Phone App (UDP) <--Wi-Fi--> BearPi Gateway <--SLE--> WS63E Car
```

- BearPi runs as **SLE Server**, advertises as `sle_uart_server`
- BearPi runs **Wi-Fi SoftAP** for the phone App
- The WS63E car connects as **SLE Client** (unchanged firmware)
- Commands flow: Phone → UDP → BearPi → SLE → Car
- Telemetry flows: Car → SLE → BearPi cache → UDP → Phone

## Build

This repository keeps a versioned source copy under:

```text
G:\fbb_ws63_20260226\vendor\BearPi-Pico_H3863\products\ws63e_env_gateway
```

The actual VSCode/DevEco BearPi build workspace is separate:

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
```

Sync this product directory into:

```text
G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863\application\samples\products\ws63e_env_gateway
```

Then build from the BearPi SDK root:

```powershell
Set-Location G:\Hi3863_BEARPI\SDK\bearpi-pico_h3863
$env:PATH = "G:\DevTools_CFBB_V1.0.12\thirdparty\ccache;$env:PATH"
python build.py ws63-liteos-app
```

Or use the VSCode/HiSpark Studio IDE in the BearPi SDK workspace:
- Target: `ws63-liteos-app`
- Kconfig: `CONFIG_SAMPLE_SUPPORT_WS63E_ENV_GATEWAY=y`
- Enables: `SUPPORT_SLE_PERIPHERAL`

## Flash

- Serial port: **COM5**
- Use HiBurn tool or equivalent programmer
- Baud rate: 115200

## Wi-Fi AP

| Parameter | Value |
|---|---|
| SSID | `WS63E_ENV_GATEWAY` |
| Password | `12345678` |
| IP | `192.168.6.1` |
| Netmask | `255.255.255.0` |
| DHCP | Enabled (192.168.6.x range) |
| Channel | 13 |
| Security | WPA2/WPA mixed |

## Cloud Uplink

When router STA credentials are configured and DHCP succeeds, the gateway also
uploads the latest cached SLE telemetry directly to the cloud ingest API.

Local secret config is kept in:

```text
vendor/BearPi-Pico_H3863/products/ws63e_env_gateway/cloud_config.h
```

This file is ignored by Git. If it is missing, copy
`cloud_config.example.h` to `cloud_config.h` and replace
`CLOUD_UPLINK_DEVICE_KEY` with the cloud `DEVICE_INGEST_KEY`.

Current first-pass transport is HTTP over TCP:

```text
POST http://www.rxcccccc.icu/ws63-api/api/ingest/base-stations/sle-base-001/telemetry
X-Device-Key: <DEVICE_INGEST_KEY>
```

Expected serial logs:

```text
[cloud_uplink] start http://www.rxcccccc.icu/ws63-api base=sle-base-001 device=ws63-car-001
[cloud_uplink] uploaded telemetry, bytes=...
```

## SLE

| Parameter | Value |
|---|---|
| Advertised name | `sle_uart_server` |
| Service UUID | `0x2222` |
| Property UUID | `0x2323` |
| MTU | 520 |
| Role | Server (peripheral) |

## UDP Protocol (Phone ↔ Gateway)

**Transport**: UDP (first pass — HTTP planned for later version)

| Parameter | Value |
|---|---|
| BearPi IP | `192.168.6.1` |
| Port | `8888` |
| Encoding | ASCII text, UTF-8 |

### Commands (Phone → Gateway)

Send any of these as a UDP datagram to `192.168.6.1:8888`:

```
forward
backward
left
right
stop
auto_start
auto_stop
```

JSON format is also accepted (car parser handles both):

```json
{"cmd":"forward","speed":35,"duration_ms":600}
```

### Telemetry (Gateway → Phone)

Every UDP packet sent to the gateway receives a response containing the latest cached telemetry JSON:

```json
{"seq":8,"temp_x10":286,"humi_x10":630,"light_x10":2466,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}
```

To poll telemetry without issuing a command, send `GET` or `data`.

### Test Commands

**Windows PowerShell:**

```powershell
$udp = New-Object System.Net.Sockets.UdpClient
$udp.Connect("192.168.6.1", 8888)
$bytes = [System.Text.Encoding]::ASCII.GetBytes("forward")
$udp.Send($bytes, $bytes.Length)
$remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
$recv = $udp.Receive([ref]$remote)
[System.Text.Encoding]::ASCII.GetString($recv)
```

**Linux/macOS (netcat):**

```bash
echo "forward" | nc -u -w2 192.168.6.1 8888
```

## Expected Serial Log (COM5, 115200)

```
[wifi_ap] wifi subsystem ready
[wifi_ap] SoftAP started: SSID=WS63E_ENV_GATEWAY IP=192.168.6.1
[ws63e_gateway] SLE server init OK, advertising as sle_uart_server
[sle uart server] connect state changed callback ... conn_state:0x1 ...
[sle uart server] pair complete conn_id:00, status:0x0
[ws63e_gateway] rx telemetry: {"seq":1,"temp_x10":286,...}
[udp_bridge] listening on port 8888
[udp_bridge] rx from 192.168.6.2:12345 => forward
[udp_bridge] forwarded to SLE: ret=0
[udp_bridge] tx telemetry: {"seq":1,"temp_x10":286,...}
```

## Verification Checklist

1. ✅ BearPi gateway builds
2. ✅ Flash to COM5, check serial: `SLE server init OK`
3. ✅ Wi-Fi AP `WS63E_ENV_GATEWAY` visible, connect from phone/PC
4. ✅ Car auto-connects SLE: car serial shows `[car][sle] pair complete`
5. ✅ BearPi serial shows telemetry JSON every second
6. ✅ Send `forward` via UDP → car moves forward
7. ✅ Send `stop` via UDP → car stops
8. ✅ Send `GET` via UDP → receive telemetry JSON response
9. ✅ All commands verified: forward, backward, left, right, stop, auto_start, auto_stop

## Known Limitations

- **UDP only** — HTTP API is planned but not yet implemented. UDP is the first-pass transport.
- Cloud uplink uses HTTP on port 80. HTTPS/TLS is not enabled in this firmware pass.
- **No BLE** — BLE support is not included in this version.
- **Single connection** — One car SLE Client at a time.
- **No authentication** — UDP commands are accepted from any device on the Wi-Fi network.

## Critical Implementation Note

**SLE property `operate_indication` must include `SSAP_OPERATE_INDICATION_BIT_NOTIFY`** for server→client notifications to work. Using only `READ|WRITE` causes `ssaps_notify_indicate` to return success but the client never receives data. This was the root cause of the initial command delivery failure. See `docs/gateway_sle_notify_issue.md` for full analysis.

## Reference Samples

These directories are kept unchanged as fallback references:

- `products/sle_uart` — Base SLE UART server/client
- `products/sle_gateway` — SLE + Wi-Fi STA UDP gateway
- `wifi/softap_sample` — Wi-Fi SoftAP setup
- `wifi/udp_client` — UDP client over Wi-Fi STA
