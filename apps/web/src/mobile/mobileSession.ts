import type { PatrolTask } from "../api";
import type { ConnectionMode } from "../types";

export type MobilePatrolTemplateId = "closed-loop" | "return-lane";

export interface MobilePatrolStep {
  action: "forward" | "backward" | "left" | "right" | "stop";
  speed: number;
  durationMs: number;
}

export interface MobilePatrolTemplate {
  id: MobilePatrolTemplateId;
  name: string;
  localGatewayName: string;
  localCarName: string;
  firmwareCommand: "auto_start" | "auto_return";
  steps: readonly MobilePatrolStep[];
}

export const mobilePatrolTemplates = {
  "closed-loop": {
    id: "closed-loop",
    name: "闭合环线巡检",
    localGatewayName: "基站闭合环线巡检",
    localCarName: "小车直连闭合环线巡检",
    firmwareCommand: "auto_start",
    steps: [
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]
  },
  "return-lane": {
    id: "return-lane",
    name: "折返通道巡检",
    localGatewayName: "基站折返通道巡检",
    localCarName: "小车直连折返通道巡检",
    firmwareCommand: "auto_return",
    steps: [
      { action: "forward", speed: 42, durationMs: 2200 },
      { action: "stop", speed: 0, durationMs: 500 },
      { action: "right", speed: 32, durationMs: 520 },
      { action: "forward", speed: 38, durationMs: 1600 },
      { action: "left", speed: 32, durationMs: 520 },
      { action: "backward", speed: 35, durationMs: 2200 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]
  }
} as const satisfies Record<MobilePatrolTemplateId, MobilePatrolTemplate>;

export function selectMobilePatrolTemplate(templateId?: string): MobilePatrolTemplate {
  if (templateId === "return-lane") return mobilePatrolTemplates["return-lane"];
  return mobilePatrolTemplates["closed-loop"];
}

export const firmwarePrecheckSteps = mobilePatrolTemplates["closed-loop"].steps;

export const firmwarePrecheckDurationMs = firmwarePrecheckSteps.reduce((total, step) => total + step.durationMs, 0);

export const closedLoopPatrolSteps = mobilePatrolTemplates["closed-loop"].steps;

export const closedLoopPatrolDurationMs = closedLoopPatrolSteps.reduce((total, step) => total + step.durationMs, 0);

export const returnLanePatrolSteps = mobilePatrolTemplates["return-lane"].steps;

export const returnLanePatrolDurationMs = returnLanePatrolSteps.reduce((total, step) => total + step.durationMs, 0);

export function patrolTemplateDurationMs(template: MobilePatrolTemplate): number {
  return template.steps.reduce((total, step) => total + step.durationMs, 0);
}

export function clonePatrolSteps(template: MobilePatrolTemplate): MobilePatrolStep[] {
  return template.steps.map((step) => ({ ...step }));
}

export const legacyFirmwarePrecheckSteps = [
  { action: "forward", speed: 45, durationMs: 2000 },
  { action: "left", speed: 35, durationMs: 600 },
  { action: "forward", speed: 45, durationMs: 2000 },
  { action: "right", speed: 35, durationMs: 600 },
  { action: "forward", speed: 45, durationMs: 2000 },
  { action: "stop", speed: 0, durationMs: 500 }
] as const;

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
  templateId?: string;
  now?: string;
}): PatrolTask[] {
  const createdAt = input.now ?? new Date().toISOString();
  const template = selectMobilePatrolTemplate(input.templateId);
  const name = input.mode === "gateway" ? template.localGatewayName : template.localCarName;
  const task: PatrolTask = {
    id: `local-task-${Date.parse(createdAt) || Date.now()}`,
    device_id: input.deviceId,
    base_station_id: input.baseStationId,
    name,
    steps_json: JSON.stringify(template.steps),
    status: "running",
    created_by: "local-field-operator",
    created_at: createdAt,
    started_at: createdAt,
    finished_at: null
  };
  return [task, ...input.currentTasks].slice(0, 20);
}

export function reconcileLocalPatrolTasks(tasks: PatrolTask[], nowMs = Date.now()): PatrolTask[] {
  return tasks.map((task) => {
    if (!task.id.startsWith("local-task-") || task.status !== "running") return task;
    const startedAt = Date.parse(task.started_at ?? task.created_at);
    const steps = parseTaskDurationMs(task.steps_json);
    if (!Number.isFinite(startedAt) || nowMs - startedAt < steps + 700) return task;
    const finishedAt = new Date(startedAt + steps).toISOString();
    return {
      ...task,
      status: "completed",
      finished_at: finishedAt
    };
  });
}

function parseTaskDurationMs(stepsJson: string): number {
  try {
    const parsed = JSON.parse(stepsJson) as Array<{ durationMs?: number; duration_ms?: number }>;
    if (!Array.isArray(parsed)) return closedLoopPatrolDurationMs;
    return parsed.reduce((total, step) => total + Number(step.durationMs ?? step.duration_ms ?? 0), 0);
  } catch {
    return closedLoopPatrolDurationMs;
  }
}
