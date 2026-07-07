import type {
  AgentReport,
  AuditLog,
  BaseStationRecord,
  ControlCommand,
  DeviceRecord,
  PatrolTask,
  Reading,
  RiskLevel,
  User
} from "./api";
import type { ConnectionMode } from "./App";
import { formatTime, normalizeReport } from "./utils";

export interface DashboardViewModel {
  user: User;
  connectionMode: ConnectionMode;
  selectedDevice?: DeviceRecord;
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  readings: Reading[];
  commands: ControlCommand[];
  tasks: PatrolTask[];
  reports: AgentReport[];
  audits: AuditLog[];
  latest?: Reading;
  base?: BaseStationRecord;
  rssi?: number;
  cachedCount: number;
  temperature?: number;
  humidity?: number;
  lightness?: number;
  risk: {
    level: RiskLevel;
    label: string;
    summary: string;
    suggestions: string[];
    time: string;
  };
  latestCommand: string;
  latestTask: string;
  lastDataAt: string;
}

export function riskLabel(level: RiskLevel): string {
  return level === "high" ? "HIGH 高风险" : level === "medium" ? "MEDIUM 需关注" : "LOW 稳定";
}

export function buildDashboardViewModel(input: {
  user: User;
  connectionMode: ConnectionMode;
  selectedDevice?: DeviceRecord;
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  readings: Reading[];
  commands: ControlCommand[];
  tasks: PatrolTask[];
  reports: AgentReport[];
  audits: AuditLog[];
}): DashboardViewModel {
  const latest = input.readings.at(-1);
  const base = input.baseStations.find((item) => item.id === input.selectedDevice?.base_station_id) ?? input.baseStations[0];
  const report = normalizeReport(input.reports[0]);
  const latestCommand = input.commands[0];
  const latestTask = input.tasks[0];
  const rssi = latest?.rssi ?? base?.last_rssi;
  const cachedCount = latest?.cachedCount ?? base?.cached_count ?? 0;

  return {
    ...input,
    latest,
    base,
    rssi,
    cachedCount,
    temperature: latest?.temperature,
    humidity: latest?.humidity,
    lightness: latest?.lightness,
    risk: {
      level: report.level,
      label: riskLabel(report.level),
      summary: report.summary,
      suggestions: report.suggestions,
      time: report.time
    },
    latestCommand: latestCommand ? `${latestCommand.payload} / ${latestCommand.status}` : "--",
    latestTask: latestTask ? `${latestTask.name} / ${latestTask.status}` : "--",
    lastDataAt: formatTime(latest?.recordedAt)
  };
}

export function numericSeries(readings: Reading[], field: "temperature" | "humidity" | "lightness" | "rssi", limit = 24): number[] {
  return readings.slice(-limit).map((reading) => Number(reading[field] ?? 0));
}

export function compactTime(value?: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

export function statusLabel(value?: string): string {
  if (!value) return "未知";
  if (value === "online") return "在线";
  if (value === "offline") return "离线";
  if (value === "cloud-online") return "云端在线";
  return value;
}

export function taskStatusLabel(value?: string): string {
  return {
    pending: "待拉取",
    pulled: "已拉取",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[value ?? ""] ?? (value || "--");
}
