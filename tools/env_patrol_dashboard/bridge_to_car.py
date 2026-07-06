#!/usr/bin/env python3
"""Bridge pending dashboard commands to the on-car HTTP control API."""

from __future__ import annotations

import argparse
import json
import time
from typing import Any, Callable
from urllib import request
from urllib.error import URLError


def build_dashboard_next_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/api/commands/next"


def build_car_control_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/api/control"


def _read_json(req: request.Request, opener: Callable[..., Any], timeout: float) -> dict[str, Any]:
    with opener(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def bridge_once(
    dashboard_base_url: str,
    car_base_url: str,
    opener: Callable[..., Any] = request.urlopen,
    timeout: float = 3.0,
) -> dict[str, Any]:
    next_req = request.Request(build_dashboard_next_url(dashboard_base_url), method="GET")
    try:
        next_payload = _read_json(next_req, opener, timeout)
    except (URLError, OSError, ValueError, json.JSONDecodeError) as exc:
        return {"status": "error", "stage": "dashboard", "error": str(exc)}
    command = next_payload.get("command")
    if not command:
        return {"status": "idle", "command": None}

    body = json.dumps(command, ensure_ascii=False).encode("utf-8")
    car_req = request.Request(
        build_car_control_url(car_base_url),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        car_payload = _read_json(car_req, opener, timeout)
    except (URLError, OSError, ValueError, json.JSONDecodeError) as exc:
        return {"status": "error", "stage": "car", "error": str(exc), "command": command}
    return {"status": "forwarded", "command": command, "car_response": car_payload}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dashboard-url", default="http://127.0.0.1:8763")
    parser.add_argument("--car-url", default="http://192.168.5.1:8080")
    parser.add_argument("--poll-ms", type=int, default=500)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--timeout", type=float, default=3.0)
    args = parser.parse_args()

    while True:
        result = bridge_once(args.dashboard_url, args.car_url, timeout=args.timeout)
        status = result["status"]
        if status == "forwarded":
            print(f"[bridge] forwarded {json.dumps(result['command'], ensure_ascii=False)}")
        elif status == "error":
            print(f"[bridge] error stage={result['stage']} detail={result['error']}")
        else:
            print("[bridge] idle")
        if args.once:
            break
        time.sleep(max(args.poll_ms, 100) / 1000.0)


if __name__ == "__main__":
    main()
