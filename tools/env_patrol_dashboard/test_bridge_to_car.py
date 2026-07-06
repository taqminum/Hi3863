#!/usr/bin/env python3
"""Contract checks for the dashboard-to-car bridge helper."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import URLError

from bridge_to_car import bridge_once, build_car_control_url, build_dashboard_next_url


class FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class FakeOpener:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._queue: list[dict[str, Any]] = []

    def push(self, payload: dict[str, Any]) -> None:
        self._queue.append(payload)

    def __call__(self, request, timeout: float = 0) -> FakeResponse:
        body = request.data.decode("utf-8") if getattr(request, "data", None) else None
        self.calls.append(
            {
                "url": request.full_url,
                "method": request.get_method(),
                "body": body,
                "timeout": timeout,
            }
        )
        if not self._queue:
            raise AssertionError("unexpected request with no queued response")
        return FakeResponse(self._queue.pop(0))


class FailingOpener:
    def __init__(self, exc: Exception) -> None:
        self.exc = exc
        self.calls: list[dict[str, Any]] = []

    def __call__(self, request, timeout: float = 0) -> FakeResponse:
        self.calls.append(
            {
                "url": request.full_url,
                "method": request.get_method(),
                "timeout": timeout,
            }
        )
        raise self.exc


def main() -> None:
    assert build_dashboard_next_url("http://127.0.0.1:8763") == "http://127.0.0.1:8763/api/commands/next"
    assert build_dashboard_next_url("http://127.0.0.1:8763/") == "http://127.0.0.1:8763/api/commands/next"
    assert build_car_control_url("http://192.168.5.1:8080") == "http://192.168.5.1:8080/api/control"
    assert build_car_control_url("http://192.168.5.1:8080/") == "http://192.168.5.1:8080/api/control"

    opener = FakeOpener()
    opener.push({"ok": True, "command": {"cmd": "forward", "speed": 35, "duration_ms": 600}})
    opener.push({"ok": True, "message": "accepted"})
    result = bridge_once("http://127.0.0.1:8763", "http://192.168.5.1:8080", opener=opener, timeout=2.5)
    assert result["status"] == "forwarded"
    assert result["command"]["cmd"] == "forward"
    assert len(opener.calls) == 2
    assert opener.calls[0]["url"].endswith("/api/commands/next")
    assert opener.calls[0]["method"] == "GET"
    assert opener.calls[1]["url"].endswith("/api/control")
    assert opener.calls[1]["method"] == "POST"
    assert json.loads(opener.calls[1]["body"]) == {"cmd": "forward", "speed": 35, "duration_ms": 600}

    opener = FakeOpener()
    opener.push({"ok": True, "command": None})
    result = bridge_once("http://127.0.0.1:8763", "http://192.168.5.1:8080", opener=opener, timeout=1.0)
    assert result["status"] == "idle"
    assert len(opener.calls) == 1
    assert opener.calls[0]["method"] == "GET"

    opener = FailingOpener(URLError("dashboard down"))
    result = bridge_once("http://127.0.0.1:8763", "http://192.168.5.1:8080", opener=opener, timeout=1.0)
    assert result["status"] == "error"
    assert result["stage"] == "dashboard"
    assert "dashboard down" in result["error"]
    assert len(opener.calls) == 1

    class SemiFailingOpener(FakeOpener):
        def __call__(self, request, timeout: float = 0) -> FakeResponse:
            if request.get_method() == "POST":
                raise URLError("car offline")
            return super().__call__(request, timeout)

    opener = SemiFailingOpener()
    opener.push({"ok": True, "command": {"cmd": "stop", "speed": 0, "duration_ms": 0}})
    result = bridge_once("http://127.0.0.1:8763", "http://192.168.5.1:8080", opener=opener, timeout=1.0)
    assert result["status"] == "error"
    assert result["stage"] == "car"
    assert "car offline" in result["error"]
    assert result["command"]["cmd"] == "stop"

    print("bridge helper checks passed")


if __name__ == "__main__":
    main()
