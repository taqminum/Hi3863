import type { ConnectionMode } from "../types";

export function defaultMobileConnectionMode(storedMode: string | null): ConnectionMode {
  if (storedMode === "cloud" || storedMode === "gateway" || storedMode === "car-direct") return storedMode;
  if (storedMode === "local") return "gateway";
  return "cloud";
}

export function mobileSessionAllowsLocalControl(connectionMode: ConnectionMode, token: string | null): boolean {
  return connectionMode === "gateway" || connectionMode === "car-direct" || Boolean(token);
}

export function shouldPollLocalTelemetry(nowMs: number, lastControlAtMs: number, quietMs = 800): boolean {
  return lastControlAtMs <= 0 || nowMs - lastControlAtMs >= quietMs;
}

export function shouldAutoFallbackGatewayToCarDirect(_failureCount: number): boolean {
  return false;
}
