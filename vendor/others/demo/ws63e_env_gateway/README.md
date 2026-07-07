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

This contribution is organized for the community `vendor/others` layout:

```text
vendor/others/demo/ws63e_env_gateway
vendor/others/build_config.json
```

Build from the WS63 SDK root:

```bash
python build.py ws63-liteos-app
```

When using the IDE workflow, select the `ws63-liteos-app` target and enable:

```text
CONFIG_SAMPLE_SUPPORT_WS63E_ENV_GATEWAY=y
CONFIG_SUPPORT_SLE_PERIPHERAL=1
```

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
- **No BLE** — BLE support is not included in this version.
- **Single connection** — One car SLE Client at a time.
- **No authentication** — UDP commands are accepted from any device on the Wi-Fi network.

## Critical Implementation Note

**SLE property `operate_indication` must include `SSAP_OPERATE_INDICATION_BIT_NOTIFY`** for server-to-client notifications to work. Using only `READ|WRITE` can make `ssaps_notify_indicate` return success while the client never receives data. The gateway keeps the notify property declaration aligned with the official SLE UART server sample.

## Reference Samples

These directories are kept unchanged as fallback references:

- `products/sle_uart` — Base SLE UART server/client
- `products/sle_gateway` — SLE + Wi-Fi STA UDP gateway
- `wifi/softap_sample` — Wi-Fi SoftAP setup
- `wifi/udp_client` — UDP client over Wi-Fi STA
