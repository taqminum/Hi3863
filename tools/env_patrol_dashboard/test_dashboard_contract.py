#!/usr/bin/env python3
"""Contract checks for the local WS63E env patrol dashboard."""

from __future__ import annotations

from pathlib import Path

from server import TELEMETRY_RE, TelemetryStore, analyze


def main() -> None:
    store = TelemetryStore(limit=4)
    sample = store.add(
        {
            "seq": 7,
            "temp_x10": 321,
            "humi_x10": 805,
            "light_x10": 95,
            "temp_alert": 1,
            "humi_alert": 1,
            "light_alert": 1,
            "motion": 4,
            "patrol": 1,
            "err": 0,
        }
    )
    assert sample["seq"] == 7
    assert sample["temp_alert"] == 1
    assert sample["humi_alert"] == 1
    assert sample["light_alert"] == 1

    result = analyze([sample])
    assert result["level"] == "warn"
    assert result["alerts"] == ["TEMP", "HUMI", "LIGHT"]
    assert isinstance(result["trends"], list)
    assert any("TEMP" in item or "温度" in item for item in result["items"])
    assert any("HUMI" in item or "湿度" in item for item in result["items"])
    assert any("LIGHT" in item or "光照" in item for item in result["items"])

    command = store.add_command({"cmd": "forward", "speed": 35, "duration_ms": 600})
    assert command["cmd"] == "forward"
    assert command["speed"] == 35
    assert store.next_command()["cmd"] == "forward"

    auto_start = store.add_command({"cmd": "auto_start"})
    assert auto_start["cmd"] == "auto_start"
    assert store.next_command()["cmd"] == "auto_start"

    line = '[car] telemetry {"seq":8,"temp_x10":286,"humi_x10":630,"light_x10":2466,"temp_alert":0,"humi_alert":0,"light_alert":0,"motion":0,"patrol":0,"err":0}'
    assert TELEMETRY_RE.search(line)
    assert store.add_line(line) is not None

    html = Path(__file__).resolve().parent.joinpath("static", "index.html").read_text(encoding="utf-8")
    assert "Auto Start" in html
    assert "Auto Stop" in html
    assert "最近命令" in html
    assert "待发命令" in html

    print("dashboard contract checks passed")


if __name__ == "__main__":
    main()
