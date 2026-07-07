export type Role = "admin" | "operator" | "viewer";
export type Permission =
  | "device:read"
  | "device:update"
  | "command:create"
  | "task:create"
  | "audit:read"
  | "user:manage";

export type ControlAction = "forward" | "backward" | "stop";

export interface ControlInput {
  action: ControlAction;
  speed: number;
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
  rssi: number;
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

export function toCarControlPayload(input: ControlInput): string {
  if (input.action === "stop") return "STOP:0";
  const speed = clamp(input.speed, 0, 100);
  return input.action === "forward" ? `FORWARD:${speed}` : `BACKWARD:${speed}`;
}

export function parsePatrolSteps(value: unknown): PatrolStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is Record<string, unknown> => typeof step === "object" && step !== null)
    .map((step) => {
      const action = step.action === "backward" || step.action === "stop" ? step.action : "forward";
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
  const rssi = Number(payload.link?.rssi ?? -45);
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
    rssi,
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

  if (latest.rssi <= -75) {
    findings.push("星闪链路偏弱");
    suggestions.push("建议调整基站位置或缩短小车与基站距离。");
    evidence.push({ code: "rssi_weak", label: "SLE RSSI 偏弱", value: latest.rssi, threshold: -75 });
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
