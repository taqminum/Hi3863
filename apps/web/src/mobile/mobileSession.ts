import type { ConnectionMode } from "../App";

export function defaultMobileConnectionMode(storedMode: string | null): ConnectionMode {
  return storedMode === "cloud" ? "cloud" : "local";
}

export function mobileSessionAllowsLocalControl(connectionMode: ConnectionMode, token: string | null): boolean {
  return connectionMode === "local" || Boolean(token);
}

export function shouldPollLocalTelemetry(nowMs: number, lastControlAtMs: number, quietMs = 800): boolean {
  return lastControlAtMs <= 0 || nowMs - lastControlAtMs >= quietMs;
}
