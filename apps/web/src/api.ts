export type Role = "admin" | "operator" | "viewer";
export type Action = "forward" | "backward" | "left" | "right" | "stop" | "drive" | "auto_start" | "auto_return" | "auto_stop";
export type RiskLevel = "low" | "medium" | "high";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface Reading {
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

export interface DeviceRecord {
  id: string;
  name: string;
  base_station_id: string;
  base_station_name?: string;
  status: string;
  connection_mode: string;
  direct_url: string;
  last_seen: string;
  remark?: string;
}

export interface BaseStationRecord {
  id: string;
  name: string;
  status: string;
  network_status: string;
  last_heartbeat: string;
  last_rssi?: number;
  cached_count?: number;
}

export interface ControlCommand {
  id: string;
  device_id: string;
  base_station_id: string;
  action: Action;
  speed: number;
  payload: string;
  status: string;
  created_by: string;
  created_at: string;
  acknowledged_at?: string | null;
  error_message?: string | null;
}

export interface PatrolTask {
  id: string;
  device_id: string;
  base_station_id: string;
  name: string;
  steps_json: string;
  status: "pending" | "pulled" | "running" | "completed" | "failed" | "cancelled";
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AgentReport {
  id?: string;
  deviceId?: string;
  device_id?: string;
  riskLevel?: RiskLevel;
  risk_level?: RiskLevel;
  summary: string;
  suggestions?: string[];
  suggestions_json?: string;
  evidence?: Array<{ code: string; label: string; value: number | string; threshold?: number | string }>;
  evidence_json?: string;
  createdAt?: string;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string;
  created_at: string;
}

export interface DashboardData {
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  readings: Reading[];
  recentCommands: ControlCommand[];
  recentTasks: PatrolTask[];
  agentReports: AgentReport[];
}

export interface HealthData {
  ok: boolean;
  cloud?: {
    host: string;
    domain: string;
  };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export function apiBaseUrl(): string {
  return baseUrl.replace(/\/$/, "");
}

export const exportUrls = {
  readings(deviceId: string, token: string) {
    return `${apiBaseUrl()}/api/export/readings.csv?deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(token)}`;
  },
  summary(token: string) {
    return `${apiBaseUrl()}/api/export/summary.json?token=${encodeURIComponent(token)}`;
  }
};

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new ApiError("无法连接云服务器，请检查网络、域名或服务器状态", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error ?? data.message ?? `HTTP ${response.status}`, response.status);
  }
  return data as T;
}

async function requestText(path: string, token: string | null, options: RequestInit = {}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: "text/plain, text/csv, application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new ApiError("无法连接云服务器，请检查网络、域名或服务器状态", 0);
  }
  const data = await response.text();
  if (!response.ok) {
    throw new ApiError(data || `HTTP ${response.status}`, response.status);
  }
  return data;
}

export const api = {
  health() {
    return request<HealthData>("/api/health", null);
  },
  login(username: string, password: string) {
    return request<{ token: string; user: User }>("/api/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },
  dashboard(token: string, deviceId: string) {
    return request<DashboardData>(`/api/dashboard?deviceId=${encodeURIComponent(deviceId)}`, token);
  },
  devices(token: string) {
    return request<{ devices: DeviceRecord[] }>("/api/devices", token);
  },
  updateDevice(token: string, id: string, body: { name: string; baseStationId: string; remark: string }) {
    return request<{ device: DeviceRecord }>(`/api/devices/${encodeURIComponent(id)}`, token, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  },
  baseStations(token: string) {
    return request<{ baseStations: BaseStationRecord[] }>("/api/base-stations", token);
  },
  readings(token: string, deviceId: string, options: { from?: string; to?: string; limit?: number } = {}) {
    const params = new URLSearchParams({
      deviceId,
      limit: String(options.limit ?? 160)
    });
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);
    return request<{ readings: Reading[] }>(`/api/readings?${params.toString()}`, token);
  },
  commands(token: string, deviceId: string) {
    return request<{ commands: ControlCommand[] }>(`/api/commands?deviceId=${encodeURIComponent(deviceId)}&limit=50`, token);
  },
  command(token: string, body: { deviceId: string; baseStationId: string; action: Action; speed: number; left?: number; right?: number; durationMs?: number }) {
    return request<{ command: ControlCommand }>("/api/commands", token, { method: "POST", body: JSON.stringify(body) });
  },
  patrolTasks(token: string) {
    return request<{ tasks: PatrolTask[] }>("/api/patrol-tasks", token);
  },
  createPatrol(token: string, body: { deviceId: string; baseStationId: string; name: string; steps: unknown[] }) {
    return request<{ task: PatrolTask }>("/api/patrol-tasks", token, { method: "POST", body: JSON.stringify(body) });
  },
  reports(token: string) {
    return request<{ reports: AgentReport[] }>("/api/agent-reports", token);
  },
  createReport(token: string, deviceId: string) {
    return request<{ report: AgentReport }>("/api/agent-reports/current", token, {
      method: "POST",
      body: JSON.stringify({ deviceId })
    });
  },
  analyzeHistory(token: string, body: {
    deviceId: string;
    range: { from: string; to: string };
    source: string;
    readings: Reading[];
    missingIntervals: Array<{ from: string; to: string; durationMs: number }>;
  }) {
    return request<{ report: AgentReport }>("/api/agent/analyze-history", token, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },
  audits(token: string) {
    return request<{ logs: AuditLog[] }>("/api/audit-logs", token);
  },
  exportReadingsCsv(token: string, deviceId: string) {
    return requestText(`/api/export/readings.csv?deviceId=${encodeURIComponent(deviceId)}`, token);
  },
  async exportSummaryJson(token: string, deviceId: string) {
    const data = await request<DashboardData>(`/api/export/summary.json?deviceId=${encodeURIComponent(deviceId)}`, token);
    return JSON.stringify(data, null, 2);
  }
};
