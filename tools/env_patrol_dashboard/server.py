#!/usr/bin/env python3
"""Local Web dashboard for the WS63E environment patrol car telemetry."""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
TELEMETRY_RE = re.compile(r"\[car\]\s+telemetry\s+(\{.*\})")


class TelemetryStore:
    def __init__(self, limit: int = 300) -> None:
        self._limit = limit
        self._seq = 0
        self._samples: list[dict[str, Any]] = []
        self._commands: list[dict[str, Any]] = []
        self._pending_commands: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    def add(self, sample: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        normalized = {
            "seq": int(sample.get("seq", 0)),
            "temp": int(sample.get("temp_x10", 0)) / 10.0,
            "humidity": int(sample.get("humi_x10", 0)) / 10.0,
            "light": int(sample.get("light_x10", 0)) / 10.0,
            "temp_alert": int(sample.get("temp_alert", 0)),
            "humi_alert": int(sample.get("humi_alert", 0)),
            "light_alert": int(sample.get("light_alert", 0)),
            "motion": int(sample.get("motion", 0)),
            "patrol": int(sample.get("patrol", 0)),
            "err": int(sample.get("err", 0)),
            "received_at": now,
        }
        with self._lock:
            self._seq += 1
            normalized["server_seq"] = self._seq
            self._samples.append(normalized)
            if len(self._samples) > self._limit:
                self._samples = self._samples[-self._limit :]
        return normalized

    def add_line(self, line: str) -> dict[str, Any] | None:
        match = TELEMETRY_RE.search(line.strip())
        if not match:
            return None
        return self.add(json.loads(match.group(1)))

    def add_command(self, command: dict[str, Any]) -> dict[str, Any]:
        item = {
            "id": int(time.time() * 1000),
            "created_at": time.time(),
            "cmd": str(command.get("cmd", command.get("motion", "stop"))),
            "speed": int(command.get("speed", 0)),
            "duration_ms": int(command.get("duration_ms", 0)),
        }
        with self._lock:
            self._commands.append(item)
            self._commands = self._commands[-50:]
            self._pending_commands.append(item)
            self._pending_commands = self._pending_commands[-20:]
        return item

    def next_command(self) -> dict[str, Any] | None:
        with self._lock:
            if not self._pending_commands:
                return None
            return self._pending_commands.pop(0)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            samples = list(self._samples)
            commands = list(self._commands)
        latest = samples[-1] if samples else None
        return {
            "latest": latest,
            "samples": samples,
            "commands": commands,
            "analysis": analyze(samples),
        }


def analyze(samples: list[dict[str, Any]]) -> dict[str, Any]:
    if not samples:
        return {
            "level": "idle",
            "summary": "等待小车遥测数据",
            "items": ["烧录后打开串口，保存日志并让本工具读取。"],
            "alerts": [],
            "trends": [],
        }

    latest = samples[-1]
    items: list[str] = []
    alerts: list[str] = []
    trends: list[str] = []
    level = "ok"

    if latest["err"] != 0:
        level = "warn"
        items.append(f"设备上报错误码 {latest['err']}，优先查看串口初始化/传感器日志。")
    if latest["temp_alert"]:
        level = "warn"
        alerts.append("TEMP")
        items.append("TEMP 告警已触发，当前温度超过设定高阈值。")
    if latest["humi_alert"]:
        level = "warn"
        alerts.append("HUMI")
        items.append("HUMI 告警已触发，当前湿度超过设定高阈值。")
    if latest["light_alert"]:
        level = "warn"
        alerts.append("LIGHT")
        items.append("LIGHT 告警已触发，当前光照低于设定低阈值。")
    if latest["humidity"] > 75:
        level = "warn"
        items.append("湿度偏高，适合标记为重点巡检区域。")
    elif latest["humidity"] < 30:
        level = "warn"
        items.append("湿度偏低，农业场景可提示补水或复查。")
    if latest["light"] < 80:
        items.append("光照较低，可提示夜间/遮挡区域。")
    elif latest["light"] > 3000:
        items.append("光照较强，可提示强光暴晒区域。")

    if len(samples) >= 6:
        recent = samples[-6:]
        temp_delta = recent[-1]["temp"] - recent[0]["temp"]
        humi_delta = recent[-1]["humidity"] - recent[0]["humidity"]
        light_delta = recent[-1]["light"] - recent[0]["light"]
        if abs(temp_delta) >= 1.0:
            trend = f"温度 {temp_delta:+.1f} C"
            trends.append(trend)
            items.append(f"近 6 次采样{trend}。")
        if abs(humi_delta) >= 3.0:
            trend = f"湿度 {humi_delta:+.1f}%RH"
            trends.append(trend)
            items.append(f"近 6 次采样{trend}。")
        if abs(light_delta) >= 300.0:
            trend = f"光照 {light_delta:+.1f} lx"
            trends.append(trend)
            items.append(f"近 6 次采样{trend}。")

    if not items:
        items.append("环境数据平稳，未发现明显异常。")

    return {
        "level": level,
        "summary": f"最新采样：{latest['temp']:.1f} C / {latest['humidity']:.1f}%RH / {latest['light']:.1f} lx",
        "items": items,
        "alerts": alerts,
        "trends": trends,
    }


STORE = TelemetryStore()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            self._send_file(STATIC / "index.html")
        elif path == "/api/snapshot":
            self._send_json(STORE.snapshot())
        elif path == "/api/commands/next":
            self._send_json({"ok": True, "command": STORE.next_command()})
        elif path == "/events":
            self._send_events()
        else:
            self._send_file(STATIC / path.lstrip("/"))

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            if path == "/api/telemetry":
                payload = json.loads(body) if body.strip().startswith("{") else None
                sample = STORE.add(payload) if payload is not None else STORE.add_line(body)
                if sample is None:
                    raise ValueError("no telemetry JSON found")
                self._send_json({"ok": True, "sample": sample})
            elif path == "/api/command":
                self._send_json({"ok": True, "command": STORE.add_command(json.loads(body))})
            else:
                self.send_error(404)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"ok": False, "error": str(exc)}, status=400)

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[dashboard] " + fmt % args)

    def _send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        last_seq = -1
        while True:
            snapshot = STORE.snapshot()
            latest = snapshot["latest"]
            server_seq = latest["server_seq"] if latest else 0
            if server_seq != last_seq:
                data = json.dumps(snapshot, ensure_ascii=False)
                self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                self.wfile.flush()
                last_seq = server_seq
            time.sleep(1)


def tail_log(path: Path) -> None:
    print(f"[dashboard] tailing telemetry log: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(exist_ok=True)
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(0, 2)
        while True:
            line = handle.readline()
            if not line:
                time.sleep(0.5)
                continue
            try:
                STORE.add_line(line)
            except Exception as exc:  # noqa: BLE001
                print(f"[dashboard] ignored line: {exc}")


def seed_demo_data() -> None:
    for i in range(8):
        STORE.add(
            {
                "seq": i + 1,
                "temp_x10": 280 + i,
                "humi_x10": 620 + i * 2,
                "light_x10": 26000 + i * 900,
                "temp_alert": 0,
                "humi_alert": 0,
                "light_alert": 0,
                "motion": 0,
                "patrol": 0,
                "err": 0,
            }
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8763)
    parser.add_argument("--log-file", type=Path)
    parser.add_argument("--demo", action="store_true")
    args = parser.parse_args()

    if args.demo:
        seed_demo_data()
    if args.log_file:
        threading.Thread(target=tail_log, args=(args.log_file,), daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[dashboard] open http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
