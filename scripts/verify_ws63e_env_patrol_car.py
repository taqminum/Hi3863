import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src/application/samples/Farsight/ws63e_env_patrol_car"


def read(path: Path) -> str:
    assert path.exists(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def assert_contains(text: str, pattern: str, message: str) -> None:
    assert re.search(pattern, text), message


def main() -> None:
    cmake = read(APP / "CMakeLists.txt")
    app_main = read(APP / "app_main.c")
    project = read(ROOT / "src/ws63e_env_patrol_car.hiproj")
    target_config = read(
        ROOT / "src/build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config"
    )
    board_h = read(APP / "board/car_board.h")
    board_c = read(APP / "board/car_board.c")
    i2c_h = read(APP / "drivers/i2c_bus.h")
    i2c_c = read(APP / "drivers/i2c_bus.c")
    motor_c = read(APP / "motor/car_motor.c")
    wifi_ap_c = read(APP / "comm/wifi_ap.c")
    dashboard_server = read(ROOT / "tools/env_patrol_dashboard/server.py")
    dashboard_page = read(ROOT / "tools/env_patrol_dashboard/static/index.html")

    required_files = [
        APP / "model/env_data.h",
        APP / "sensors/aht20.h",
        APP / "sensors/aht20.c",
        APP / "sensors/bh1750.h",
        APP / "sensors/bh1750.c",
        APP / "display/oled_status.h",
        APP / "display/oled_status.c",
        APP / "motor/car_motor.h",
        APP / "motor/car_motor.c",
        APP / "patrol/patrol_route.h",
        APP / "patrol/patrol_route.c",
        APP / "comm/telemetry.h",
        APP / "comm/telemetry.c",
        APP / "comm/PROTOCOL.md",
        APP / "comm/control_command.h",
        APP / "comm/control_command.c",
        APP / "comm/CONTROL.md",
    ]
    module_texts = [read(path) for path in required_files]
    code_texts = [
        cmake,
        app_main,
        board_h,
        board_c,
        i2c_h,
        i2c_c,
        wifi_ap_c,
        dashboard_server,
        dashboard_page,
    ] + [read(path) for path in required_files if path.suffix in [".c", ".h"]]

    combined = "\n".join(
        [cmake, app_main, project, board_h, board_c, i2c_h, i2c_c, wifi_ap_c, dashboard_server, dashboard_page]
        + module_texts
    )

    assert not (ROOT / "src/demo1.hiproj").exists(), "demo1.hiproj must be removed after project rename"
    assert_contains(project, r"sdk_path=g:\\fbb_ws63_20260226\\src", "project must point at the current SDK path")
    assert_contains(project, r"target=WS63-LITEOS-APP", "project must keep the WS63 LiteOS app target")
    assert_contains(project, r"baud=115200", "project serial baud must be 115200")

    assert_contains(cmake, r"board/car_board\.c", "CMake must compile car_board.c")
    assert_contains(cmake, r"drivers/i2c_bus\.c", "CMake must compile i2c_bus.c")
    for source in [
        "sensors/aht20.c",
        "sensors/bh1750.c",
        "display/oled_status.c",
        "motor/car_motor.c",
        "patrol/patrol_route.c",
        "comm/telemetry.c",
        "comm/control_command.c",
    ]:
        assert_contains(cmake, re.escape(source), f"CMake must compile {source}")
    assert_contains(cmake, r"PUBLIC_HEADER", "CMake must export board/driver headers")
    assert_contains(cmake, r"CMAKE_CURRENT_SOURCE_DIR\}", "CMake must export the sample root include path")
    assert_contains(app_main, r'"board/car_board\.h"', "app_main must include board header from sample root")
    for header in [
        '"model/env_data.h"',
        '"sensors/aht20.h"',
        '"sensors/bh1750.h"',
        '"display/oled_status.h"',
        '"motor/car_motor.h"',
        '"patrol/patrol_route.h"',
        '"comm/telemetry.h"',
    ]:
        assert_contains(app_main, re.escape(header), f"app_main must include {header}")
    assert_contains(board_c, r'"\.\./drivers/i2c_bus\.h"', "board code must include driver header by relative path")
    assert_contains(i2c_c, r'"\.\./board/car_board\.h"', "driver code must include board header by relative path")

    assert_contains(board_h, r"CAR_I2C_BUS\s+1", "I2C bus must be bus 1")
    assert_contains(board_h, r"CAR_I2C_SCL_PIN\s+15", "SCL must be GPIO 15")
    assert_contains(board_h, r"CAR_I2C_SDA_PIN\s+16", "SDA must be GPIO 16")
    assert_contains(board_h, r"CAR_I2C_PIN_MODE\s+2", "I2C pin mode must be 2")
    assert_contains(board_h, r"CAR_I2C_BAUDRATE\s+100000", "I2C baudrate must use the sensor/OLED-proven stable bus speed")
    assert_contains(board_h, r"CAR_I2C_MASTER_CODE\s+0", "I2C master code must use the sensor/OLED-proven stable value")

    for symbol in [
        "CAR_I2C_ADDR_BH1750",
        "CAR_I2C_ADDR_AHT20",
        "CAR_I2C_ADDR_SSD1306",
        "CAR_I2C_ADDR_PCA9555",
        "CAR_I2C_ADDR_PCA9555_SCHEMATIC",
        "CAR_I2C_ADDR_CW2015",
        "CAR_I2C_ADDR_WHEEL_PWM",
        "CAR_I2C_ADDR_STM8S_MOTOR_LEGACY",
        "CAR_I2C_ADDR_STM8S_MOTOR_COMPAT",
    ]:
        assert_contains(board_h, symbol, f"missing address symbol {symbol}")

    expected_addresses = ["0x23", "0x38", "0x3C", "0x28", "0x14", "0x62", "0x5A", "0x15", "0x2A"]
    for addr in expected_addresses:
        assert addr in combined, f"missing hardware/probe address {addr}"

    assert_contains(board_c, r"hardware ACK", "PCA9555 probe must record observed 0x28 ACK behavior")
    assert_contains(combined, r"7-bit", "source must document 7-bit schematic values where relevant")
    assert_contains(cmake, r"she_docs/ssd1306\.c", "CMake must use she_docs SSD1306 driver")
    assert_contains(cmake, r"she_docs/ssd1306_fonts\.c", "CMake must compile she_docs SSD1306 fonts")
    assert_contains(combined, r"L9110S", "motor implementation/docs must target the car L9110S driver")
    assert_contains(motor_c, r'"\.\./drivers/i2c_bus\.h"', "motor code must use the shared I2C wrapper")
    assert_contains(motor_c, r"CAR_I2C_ADDR_WHEEL_PWM", "motor code must use the D-drive exip06 0x5A PWM address")
    assert_contains(motor_c, r"CAR_I2C_ADDR_STM8S_MOTOR_LEGACY", "motor code must retain legacy 0x15 probe")
    assert_contains(motor_c, r"CAR_I2C_ADDR_STM8S_MOTOR_COMPAT", "motor code must retain legacy 0x2A probe")
    assert_contains(motor_c, r"0x16", "motor code must send the exip06 PWM frequency setup byte")
    assert_contains(motor_c, r"CAR_MOTOR_FREQ_SETTLE_TICKS", "motor code must wait after PWM frequency setup like exip06")
    assert_contains(motor_c, r"osDelay\(CAR_MOTOR_FREQ_SETTLE_TICKS\)", "motor code must delay after frequency setup")
    assert_contains(motor_c, r"CAR_MOTOR_PERIOD_TICKS\s+1000U", "motor PWM scale must match exip06 0-1000 duty values")
    assert_contains(app_main, r"ENV_PATROL_MOTOR_TEST_SPEED\s+50U", "motor self-test should use exip06 duty 500 via 50 percent")
    assert_contains(motor_c, r"g_motor_addr", "motor code must remember the working STM8S address")
    assert_contains(motor_c, r"g_motor_available", "motor code must remember whether the STM8S bridge is available")
    assert_contains(motor_c, r"motor unavailable; skip cmd", "motor code must avoid repeated writes when bridge is absent")
    assert_contains(motor_c, r"car_i2c_write", "motor code must send she_docs motor commands over I2C")
    for register in ["0x70", "0x80", "0x90", "0xA0"]:
        assert_contains(motor_c, register, f"missing she_docs motor register {register}")
    for direct_symbol in ["pwm.h", "uapi_pwm_", "GPIO_00", "GPIO_01", "CAR_M1_IN0", "CAR_M2_IN0"]:
        assert direct_symbol not in motor_c, f"motor must not use direct station-style GPIO/PWM path: {direct_symbol}"
    assert_contains(combined, r"she_docs/ssd1306\.h", "OLED adapter must include the she_docs SSD1306 header")
    assert_contains(dashboard_server, r"TELEMETRY_RE", "dashboard must parse firmware telemetry lines")
    assert_contains(dashboard_server, r"/api/telemetry", "dashboard must expose telemetry ingest endpoint")
    assert_contains(dashboard_server, r"/api/snapshot", "dashboard must expose snapshot endpoint")
    assert_contains(dashboard_server, r"/api/commands/next", "dashboard must expose command queue consume endpoint")
    assert_contains(dashboard_page, r"EventSource", "dashboard page must subscribe to live updates")
    assert_contains(dashboard_page, r"canvas", "dashboard page must render a trend chart")

    assert_contains(i2c_h, r"car_i2c_write", "missing car_i2c_write interface")
    assert_contains(i2c_h, r"car_i2c_read", "missing car_i2c_read interface")
    assert_contains(i2c_h, r"car_i2c_probe", "missing car_i2c_probe interface")
    assert_contains(i2c_h, r"car_i2c_reset", "missing I2C reset interface")
    assert_contains(combined, r"env_data_t", "missing shared environment data model")
    assert_contains(combined, r"aht20_read", "missing AHT20 read interface")
    assert_contains(combined, r"bh1750_read", "missing BH1750 read interface")
    assert_contains(combined, r"oled_status_render", "missing OLED render interface")
    assert_contains(combined, r"car_motor_command", "missing motor command interface")
    assert_contains(combined, r"patrol_route_tick", "missing timed route interface")
    assert_contains(combined, r"telemetry_publish", "missing telemetry publish interface")
    assert_contains(combined, r"telemetry_format_json", "missing stable telemetry JSON formatter")
    assert_contains(combined, r"control_command_parse", "missing manual control command parser")
    assert_contains(combined, r"control_command_apply", "missing manual control command apply hook")
    assert_contains(combined, r"temp_x10", "telemetry protocol must include temperature field")
    assert_contains(combined, r"humi_x10", "telemetry protocol must include humidity field")
    assert_contains(combined, r"light_x10", "telemetry protocol must include light field")
    assert_contains(combined, r"temp_alert", "telemetry must include temperature alert field")
    assert_contains(combined, r"humi_alert", "telemetry must include humidity alert field")
    assert_contains(combined, r"light_alert", "telemetry must include light alert field")
    assert_contains(board_h, r"car_board_init", "missing car_board_init interface")
    assert_contains(board_h, r"int\s+car_board_probe_i2c_devices", "probe entry must report I2C health")
    assert_contains(app_main, r"car_board_probe_i2c_devices", "app_main must run the probe task")
    assert_contains(app_main, r"i2c bus unhealthy", "app_main must degrade when core I2C devices are unavailable")
    assert_contains(app_main, r"skip sensors/OLED/motor", "unhealthy I2C path must avoid repeated bus writes")
    assert_contains(app_main, r"env_patrol_task", "app_main must run the patrol application task")
    assert_contains(app_main, r"ENV_PATROL_MOTOR_SELF_TEST_ON_BOOT\s+0", "motor self-test must be disabled by default")
    assert_contains(app_main, r"env_patrol_motor_self_test", "missing gated motor self-test hook")
    assert_contains(app_main, r"ENV_PATROL_FW_TAG", "firmware must print a build fingerprint to rule out stale flashing")
    assert_contains(app_main, r"env_patrol_motor_diag_exip06", "missing isolated exip06 motor diagnostic hook")
    assert_contains(app_main, r"ENV_PATROL_MOTOR_DIAG_ON_BOOT\s+0", "motor diagnostic must be disabled by default")
    assert_contains(app_main, r"CAR_TEMP_HIGH_X10", "app_main must define temperature alert threshold")
    assert_contains(app_main, r"CAR_HUMI_HIGH_X10", "app_main must define humidity alert threshold")
    assert_contains(app_main, r"CAR_LIGHT_LOW_X10", "app_main must define light alert threshold")
    assert_contains(motor_c, r"motor write", "motor writes must log raw I2C packets for diagnosis")
    assert_contains(motor_c, r"motor exip06 diag forward", "motor diagnostic must send the exact exip06 forward pattern")
    assert_contains(
        motor_c,
        r"case CAR_MOTION_FORWARD:\s+ret = motor_apply\(duty, g_direction_map\.left_forward, duty, g_direction_map\.right_reverse\);",
        "forward must use mirrored left/right wheel polarity for this car body",
    )
    assert_contains(
        motor_c,
        r"case CAR_MOTION_BACKWARD:\s+ret = motor_apply\(duty, g_direction_map\.left_reverse, duty, g_direction_map\.right_forward\);",
        "backward must use mirrored left/right wheel polarity for this car body",
    )
    assert_contains(
        motor_c,
        r"case CAR_MOTION_LEFT:\s+ret = motor_apply\(CAR_MOTOR_TURN_TICKS, g_direction_map\.left_forward, CAR_MOTOR_TURN_TICKS,\s+g_direction_map\.right_forward\);",
        "left turn must use the matched wheel direction pair validated on hardware",
    )
    assert_contains(
        motor_c,
        r"case CAR_MOTION_RIGHT:\s+ret = motor_apply\(CAR_MOTOR_TURN_TICKS, g_direction_map\.left_reverse, CAR_MOTOR_TURN_TICKS,\s+g_direction_map\.right_reverse\);",
        "right turn must use the matched wheel direction pair validated on hardware",
    )
    assert_contains(read(APP / "display/oled_status.c"), r"ALERT", "OLED must show ALERT when threshold state is active")
    assert_contains(wifi_ap_c, r"osPriorityNormal", "wifi tasks must use a platform-accepted thread priority")
    assert "osPriorityLow" not in wifi_ap_c, "wifi tasks must not use osPriorityLow on this WS63 adaptation"
    assert (
        "osPriorityBelowNormal" not in wifi_ap_c
    ), "wifi tasks must not use osPriorityBelowNormal on this WS63 adaptation"
    assert_contains(wifi_ap_c, r"GET /api/data", "wifi http server must expose /api/data")
    assert_contains(wifi_ap_c, r"POST /api/control", "wifi http server must expose /api/control")
    assert_contains(wifi_ap_c, r"setInterval", "root page must auto-refresh telemetry")
    for label in ["Forward", "Backward", "Left", "Right", "Stop"]:
        assert_contains(wifi_ap_c, label, f"root page must expose {label} control")
    for label in ["Auto Start", "Auto Stop"]:
        assert_contains(wifi_ap_c, label, f"root page must expose {label} patrol control")
    assert_contains(wifi_ap_c, r"patrol_route_start", "wifi control path must be able to start preset patrol")
    assert_contains(wifi_ap_c, r"patrol_route_stop", "wifi control path must be able to stop preset patrol")
    assert_contains(wifi_ap_c, r"control_request", "wifi control path must log request payloads")
    assert_contains(wifi_ap_c, r"control_result", "wifi control path must log apply results")
    assert_contains(wifi_ap_c, r"telemetry_request", "wifi data path must log request servicing")
    assert_contains(wifi_ap_c, r"fetch\('/api/data'", "root page must read live telemetry from /api/data")
    assert_contains(wifi_ap_c, r"fetch\('/api/control'", "root page must send commands to /api/control")
    assert_contains(
        target_config,
        r"CONFIG_SAMPLE_SUPPORT_WS63E_ENV_PATROL_CAR=y",
        "ws63_liteos_app.config must select the patrol car sample",
    )
    assert (
        "CONFIG_SAMPLE_SUPPORT_OLED_SSD1306=y" not in target_config
    ), "ws63_liteos_app.config must not select the old OLED sample at the same time"

    forbidden = [
        "buzzer",
        "beep",
        "PCF8574",
        "Track.c",
        "pid",
        "ultrasonic",
        "flame",
        "SGP30",
        "MQ-",
        "closed-loop",
        "phone",
        "mobile app",
    ]
    lower_combined = "\n".join(code_texts).lower()
    for word in forbidden:
        assert word.lower() not in lower_combined, f"forbidden legacy/unsupported feature found: {word}"

    print("ws63e_env_patrol_car static checks passed")


if __name__ == "__main__":
    main()
