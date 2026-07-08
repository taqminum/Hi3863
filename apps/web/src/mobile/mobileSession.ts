import type { PatrolTask } from "../api";
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

export function selectMobileReadings<T>(
  connectionMode: ConnectionMode,
  cachedReadings: T[],
  liveReadings: T[]
): T[] {
  if (connectionMode === "cloud" && liveReadings.length > 0) return liveReadings;
  return cachedReadings.length > 0 ? cachedReadings : liveReadings;
}

export function buildLocalPatrolTask(input: {
  currentTasks: PatrolTask[];
  deviceId: string;
  baseStationId: string;
  mode: "gateway" | "car-direct";
  now?: string;
}): PatrolTask[] {
  const createdAt = input.now ?? new Date().toISOString();
  const name = input.mode === "gateway" ? "基站预检线路" : "小车直连预检线路";
  const task: PatrolTask = {
    id: `local-task-${Date.parse(createdAt) || Date.now()}`,
    device_id: input.deviceId,
    base_station_id: input.baseStationId,
    name,
    steps_json: JSON.stringify([
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "right", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]),
    status: "running",
    created_by: "local-field-operator",
    created_at: createdAt,
    started_at: createdAt,
    finished_at: null
  };
  return [task, ...input.currentTasks].slice(0, 20);
}
