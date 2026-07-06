#!/usr/bin/env python3
"""Replay saved car serial telemetry logs into the local dashboard."""

from __future__ import annotations

import argparse
import time
import urllib.request
from pathlib import Path


def post_line(url: str, line: str) -> None:
    data = line.encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "text/plain; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("log_file", type=Path)
    parser.add_argument("--url", default="http://127.0.0.1:8763/api/telemetry")
    parser.add_argument("--delay", type=float, default=0.2)
    args = parser.parse_args()

    sent = 0
    for line in args.log_file.read_text(encoding="utf-8", errors="replace").splitlines():
        if "[car] telemetry" not in line:
            continue
        post_line(args.url, line)
        sent += 1
        if args.delay > 0:
            time.sleep(args.delay)
    print(f"replayed {sent} telemetry lines")


if __name__ == "__main__":
    main()
