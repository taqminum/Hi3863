export type Role = "admin" | "operator" | "viewer";
export type Permission =
  | "device:read"
  | "device:update"
  | "command:create"
  | "task:create"
  | "audit:read"
  | "user:manage";

export type ControlAction = "forward" | "backward" | "left" | "right" | "stop" | "drive" | "auto_start" | "auto_return" | "auto_stop";

export interface ControlInput {
  action: ControlAction;
  speed: number;
  left?: number;
  right?: number;
  durationMs?: number;
}

export interface CommandValidationResult {
  ok: boolean;
  field?: string;
  message?: string;
}

export interface PatrolStep {
  action: ControlAction;
  speed: number;
  durationMs: number;
}

export interface BaseStationTelemetry {
  batchId?: string;
  sequence?: number;
  baseStationId: string;
  receivedAt?: string;
  link?: {
    rssi?: number;
    cachedCount?: number;
    mode?: string;
  };
  devices: Array<{
    deviceId: string;
    temperature: number;
    humidity: number;
    lightness: number;
    gear?: string;
    direction?: string;
    status?: string;
  }>;
}

export interface RawCarTelemetry {
  deviceId?: string;
  device_id?: string;
  receivedAt?: string;
  seq?: number;
  temp_x10?: number;
  humi_x10?: number;
  light_x10?: number;
  temp_alert?: number;
  humi_alert?: number;
  light_alert?: number;
  motion?: number;
  patrol?: number;
  err?: number;
  rssi?: number;
  cached_count?: number;
}

export interface SensorReading {
  id: string;
  deviceId: string;
  baseStationId: string;
  temperature: number;
  humidity: number;
  lightness: number;
  gear: string;
  direction: string;
  status: string;
  linkMode: string;
  rssi?: number;
  cachedCount: number;
  recordedAt: string;
}

export interface AgentEvidence {
  code: string;
  label: string;
  value: number | string;
  threshold?: number | string;
}

export interface AgentReport {
  riskLevel: "low" | "medium" | "high";
  summary: string;
  suggestions: string[];
  evidence: AgentEvidence[];
}

const rolePermissions: Record<Role, Permission[]> = {
  admin: ["device:read", "device:update", "command:create", "task:create", "audit:read", "user:manage"],
  operator: ["device:read", "command:create", "task:create"],
  viewer: ["device:read"]
};

export function canPerform(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function currentCarPayload(cmd: Exclude<ControlAction, "drive">, speed = 0, durationMs = 0): string {
  if (cmd === "auto_start" || cmd === "auto_return" || cmd === "auto_stop") return JSON.stringify({ cmd });
  if (cmd === "stop") return JSON.stringify({ cmd: "stop", speed: 0, duration_ms: 0 });
  return JSON.stringify({
    cmd,
    speed: cmd === "left" || cmd === "right" ? clamp(speed || 50, 20, 100) : clamp(speed, 0, 100),
    duration_ms: clamp(durationMs, 0, 3000)
  });
}

function driveToCurrentCarPayload(input: ControlInput): string {
  const left = clamp(Number(input.left ?? 0), -100, 100);
  const right = clamp(Number(input.right ?? 0), -100, 100);
  const durationMs = clamp(Number(input.durationMs ?? 350), 0, 3000);
  return JSON.stringify({
    cmd: "drive",
    left,
    right,
    duration_ms: durationMs
  });
}

export function toCarControlPayload(input: ControlInput): string {
  if (input.action === "drive") {
    return driveToCurrentCarPayload(input);
  }
  return currentCarPayload(input.action, input.speed, input.durationMs ?? 600);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateControlInput(input: ControlInput): CommandValidationResult {
  if (!["forward", "backward", "left", "right", "stop", "drive", "auto_start", "auto_return", "auto_stop"].includes(input.action)) {
    return { ok: false, field: "action", message: "action must be a supported WS63E control action" };
  }
  if (input.action === "drive") {
    if (!isFiniteNumber(input.left) || input.left < -100 || input.left > 100) {
      return { ok: false, field: "left", message: "left must be a number from -100 to 100" };
    }
    if (!isFiniteNumber(input.right) || input.right < -100 || input.right > 100) {
      return { ok: false, field: "right", message: "right must be a number from -100 to 100" };
    }
    if (!isFiniteNumber(input.durationMs) || input.durationMs < 0 || input.durationMs > 3000) {
      return { ok: false, field: "durationMs", message: "durationMs must be a number from 0 to 3000" };
    }
    return { ok: true };
  }
  if (input.action === "auto_start" || input.action === "auto_return" || input.action === "auto_stop") {
    return { ok: true };
  }
  if (!isFiniteNumber(input.speed) || input.speed < 0 || input.speed > 100) {
    return { ok: false, field: "speed", message: "speed must be a number from 0 to 100" };
  }
  return { ok: true };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function rawMotionDirection(value: unknown): string {
  const names = ["stop", "forward", "backward", "left", "right"];
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < names.length ? names[index] : "unknown";
}

export function normalizeIncomingTelemetry(payload: unknown, baseStationId: string): BaseStationTelemetry {
  if (isObject(payload) && Array.isArray(payload.devices)) {
    return { ...(payload as unknown as BaseStationTelemetry), baseStationId };
  }

  const raw = isObject(payload) ? payload as RawCarTelemetry : {};
  const recordedAt = typeof raw.receivedAt === "string" ? raw.receivedAt : new Date().toISOString();
  const deviceId = String(raw.deviceId ?? raw.device_id ?? "ws63-car-001");
  const err = Number(raw.err ?? 0);
  const patrol = Boolean(raw.patrol);
  const direction = rawMotionDirection(raw.motion);

  const rssi = finiteNumberOrUndefined(raw.rssi);
  return {
    batchId: raw.seq === undefined ? undefined : `${baseStationId}-${deviceId}-${raw.seq}`,
    sequence: raw.seq,
    baseStationId,
    receivedAt: recordedAt,
    link: {
      ...(rssi === undefined ? {} : { rssi }),
      cachedCount: clamp(Number(raw.cached_count ?? 0), 0, 100000),
      mode: "sle"
    },
    devices: [
      {
        deviceId,
        temperature: Number(raw.temp_x10 ?? 0) / 10,
        humidity: Number(raw.humi_x10 ?? 0) / 10,
        lightness: Number(raw.light_x10 ?? 0) / 10,
        gear: patrol ? "AUTO" : "M",
        direction,
        status: err === 0 ? (direction === "stop" ? "idle" : "moving") : "fault"
      }
    ]
  };
}

export function parsePatrolSteps(value: unknown): PatrolStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is Record<string, unknown> => typeof step === "object" && step !== null)
    .map((step) => {
      const action = ["forward", "backward", "left", "right", "stop", "auto_start", "auto_return", "auto_stop"].includes(String(step.action))
        ? step.action as PatrolStep["action"]
        : "forward";
      return {
        action,
        speed: action === "stop" ? 0 : clamp(Number(step.speed ?? 40), 0, 100),
        durationMs: clamp(Number(step.durationMs ?? 2000), 500, 60000)
      };
    });
}

export function normalizeTelemetry(payload: BaseStationTelemetry): SensorReading[] {
  const recordedAt = payload.receivedAt ?? new Date().toISOString();
  const linkMode = payload.link?.mode ?? "sle";
  const rssi = finiteNumberOrUndefined(payload.link?.rssi);
  const cachedCount = clamp(Number(payload.link?.cachedCount ?? 0), 0, 100000);

  return payload.devices.map((device, index) => ({
    id: `${payload.baseStationId}-${device.deviceId}-${Date.parse(recordedAt) || Date.now()}-${index}`,
    deviceId: device.deviceId,
    baseStationId: payload.baseStationId,
    temperature: Number(device.temperature),
    humidity: Number(device.humidity),
    lightness: clamp(Number(device.lightness), 0, 200000),
    gear: device.gear ?? "P",
    direction: device.direction ?? "forward",
    status: device.status ?? "idle",
    linkMode,
    ...(rssi === undefined ? {} : { rssi }),
    cachedCount,
    recordedAt
  }));
}

export function createAgentReport(readings: SensorReading[]): AgentReport {
  const latest = readings.at(-1);
  if (!latest) {
    return {
      riskLevel: "low",
      summary: "暂无环境数据，等待小车或星闪基站上报。",
      suggestions: ["确认小车、星闪基站和云端链路已启动。"],
      evidence: []
    };
  }

  const findings: string[] = [];
  const suggestions: string[] = [];
  const evidence: AgentEvidence[] = [];
  let score = 0;

  if (latest.temperature >= 30) {
    findings.push("温度偏高");
    suggestions.push("建议增加高温区域巡检频次，确认是否存在设备散热或温室遮阳问题。");
    evidence.push({ code: "temperature_high", label: "温度偏高", value: latest.temperature, threshold: 30 });
    score += 2;
  } else if (latest.temperature <= 5) {
    findings.push("温度偏低");
    suggestions.push("建议检查低温环境对传感器和电池续航的影响。");
    evidence.push({ code: "temperature_low", label: "温度偏低", value: latest.temperature, threshold: 5 });
    score += 1;
  }

  if (latest.humidity < 40) {
    findings.push("湿度偏低");
    suggestions.push("农业场景可检查灌溉计划，园区场景可关注扬尘风险。");
    evidence.push({ code: "humidity_low", label: "湿度偏低", value: latest.humidity, threshold: 40 });
    score += 1;
  } else if (latest.humidity > 80) {
    findings.push("湿度偏高");
    suggestions.push("建议关注积水、霉变或设备防潮情况。");
    evidence.push({ code: "humidity_high", label: "湿度偏高", value: latest.humidity, threshold: 80 });
    score += 1;
  }

  if (latest.lightness > 1000) {
    findings.push("光照较强");
    suggestions.push("建议记录强光区域并结合温度趋势判断遮阳需求。");
    evidence.push({ code: "lightness_high", label: "光照较强", value: latest.lightness, threshold: 1000 });
    score += 1;
  }

  const latestRssi = latest.rssi;
  if (typeof latestRssi === "number" && Number.isFinite(latestRssi) && latestRssi <= -75) {
    findings.push("星闪链路偏弱");
    suggestions.push("建议调整基站位置或缩短小车与基站距离。");
    evidence.push({ code: "rssi_weak", label: "SLE RSSI 偏弱", value: latestRssi, threshold: -75 });
    score += 2;
  }

  if (latest.cachedCount > 0) {
    findings.push(`存在 ${latest.cachedCount} 条弱网缓存数据`);
    suggestions.push("建议检查基站上云链路，并在网络恢复后核对离线同步完整性。");
    evidence.push({ code: "cache_pending", label: "弱网缓存未清零", value: latest.cachedCount, threshold: 0 });
    score += 1;
  }

  if (findings.length === 0) {
    findings.push("环境与链路状态稳定");
    suggestions.push("维持当前巡检周期，持续观察历史趋势。");
  }

  return {
    riskLevel: score >= 3 ? "high" : score >= 1 ? "medium" : "low",
    summary: findings.join("，"),
    suggestions,
    evidence
  };
}
