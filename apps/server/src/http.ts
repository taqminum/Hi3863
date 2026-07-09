import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { signToken, verifyPassword, verifyToken } from "./auth.ts";
import { analyzeHistoryReadings, type MissingInterval } from "./agent-service.ts";
import { getConfig } from "./config.ts";
import {
  acknowledgeCommand,
  addAudit,
  auditCsv,
  cancelCommand,
  createCommand,
  createCurrentAgentReport,
  createPatrolTask,
  findUserByUsername,
  getDashboard,
  ingestTelemetryBatch,
  latestAgentReports,
  latestReadings,
  listAuditLogs,
  listBaseStations,
  listDevices,
  listPatrolTasks,
  listUsers,
  pendingCommands,
  pendingPatrolTasks,
  readingsByTimeRange,
  readingsCsv,
  recentCommands,
  updateBaseStation,
  updateDevice,
  updateDeviceStatus,
  updatePatrolTaskStatus
} from "./db.ts";
import {
  canPerform,
  normalizeIncomingTelemetry,
  parsePatrolSteps,
  validateControlInput,
  type Permission,
  type SensorReading
} from "./domain.ts";
import { readJson, requestId, sendJson, sendText } from "./http-utils.ts";
import { addSseClient, broadcast } from "./realtime.ts";
import type { User } from "./types.ts";

type Handler = (request: IncomingMessage, response: ServerResponse, url: URL, user: User | null) => Promise<void> | void;

const ingestKey = getConfig().ingestKey;

function send(response: ServerResponse, status: number, data: unknown): void {
  const id = response.getHeader("X-Request-Id");
  sendJson(response, status, data, typeof id === "string" ? id : undefined);
}

function requireUser(response: ServerResponse, user: User | null): user is User {
  if (user) return true;
  send(response, 401, { error: "unauthorized" });
  return false;
}

function requirePermission(response: ServerResponse, user: User | null, permission: Permission): user is User {
  if (!requireUser(response, user)) return false;
  if (canPerform(user.role, permission)) return true;
  send(response, 403, { error: "forbidden", permission });
  return false;
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function getBearerUser(request: IncomingMessage, url: URL): User | null {
  const auth = request.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : url.searchParams.get("token");
  return token ? verifyToken(token) : null;
}

function normalizeUploadedReadings(value: unknown, deviceId: string): SensorReading[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => {
      const rssi = Number(item.rssi);
      return {
        id: String(item.id ?? `app-${deviceId}-${Date.parse(String(item.recordedAt ?? item.recorded_at ?? "")) || Date.now()}-${index}`),
        deviceId: String(item.deviceId ?? item.device_id ?? deviceId),
        baseStationId: String(item.baseStationId ?? item.base_station_id ?? "app-cache"),
        temperature: Number(item.temperature ?? 0),
        humidity: Number(item.humidity ?? 0),
        lightness: Number(item.lightness ?? 0),
        gear: String(item.gear ?? "M"),
        direction: String(item.direction ?? "unknown"),
        status: String(item.status ?? "unknown"),
        linkMode: String(item.linkMode ?? item.link_mode ?? "app-cache"),
        ...(Number.isFinite(rssi) ? { rssi } : {}),
        cachedCount: Number(item.cachedCount ?? item.cached_count ?? 0),
        recordedAt: String(item.recordedAt ?? item.recorded_at ?? new Date().toISOString())
      };
    })
    .filter((item) => Number.isFinite(Date.parse(item.recordedAt)));
}

function normalizeMissingIntervals(value: unknown): MissingInterval[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      from: String(item.from ?? ""),
      to: String(item.to ?? ""),
      durationMs: Number(item.durationMs ?? item.duration_ms ?? 0)
    }))
    .filter((item) => item.from && item.to && Number.isFinite(item.durationMs));
}

const routes: Handler = async (request, response, url, user) => {
  const method = request.method ?? "GET";
  const parts = pathParts(url);
  const id = String(response.getHeader("X-Request-Id") ?? "");
  const auditDetails = (input: unknown, extra: Record<string, unknown> = {}) => ({
    requestId: id,
    actorRole: user?.role ?? "base_station",
    input,
    ...extra
  });

  if (method === "OPTIONS") {
    send(response, 204, {});
    return;
  }

  if (method === "GET" && url.pathname === "/api/events") {
    addSseClient(response);
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    const config = getConfig();
    send(response, 200, {
      ok: true,
      cloud: {
        host: config.cloud.host,
        domain: config.cloud.domain
      }
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson<{ username?: string; password?: string }>(request);
    const sessionUser = body.username ? findUserByUsername(body.username) : null;
    if (!sessionUser || !body.password || !verifyPassword(body.password, sessionUser.passwordHash)) {
      send(response, 401, { error: "invalid_credentials" });
      return;
    }
    const userData: User = {
      id: sessionUser.id,
      username: sessionUser.username,
      displayName: sessionUser.displayName,
      role: sessionUser.role
    };
    addAudit(userData.id, "login", "user", userData.id, {
      requestId: id,
      actorRole: userData.role,
      input: { username: userData.username }
    });
    send(response, 200, { token: signToken(userData), user: userData });
    return;
  }

  if (method === "GET" && url.pathname === "/api/me") {
    if (!requireUser(response, user)) return;
    send(response, 200, { user });
    return;
  }

  if (method === "GET" && url.pathname === "/api/users") {
    if (!requirePermission(response, user, "user:manage")) return;
    send(response, 200, { users: listUsers() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/dashboard") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, getDashboard(url.searchParams.get("deviceId") ?? "ws63-car-001"));
    return;
  }

  if (method === "GET" && url.pathname === "/api/devices") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, { devices: listDevices() });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "devices" && parts[2] && parts[3] === "status") {
    if (!requirePermission(response, user, "device:update")) return;
    const body = await readJson<{ status?: "online" | "offline" | "idle" | "fault"; reason?: string }>(request);
    const status = body.status ?? "offline";
    if (!["online", "offline", "idle", "fault"].includes(status)) {
      send(response, 400, { error: "invalid_status" });
      return;
    }
    const device = updateDeviceStatus({ id: parts[2], status, reason: body.reason });
    if (!device) {
      send(response, 404, { error: "device_not_found" });
      return;
    }
    addAudit(user.id, "device.status", "device", parts[2], auditDetails(body, { status }));
    broadcast("device", device);
    send(response, 200, { device });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "devices" && parts[2]) {
    if (!requirePermission(response, user, "device:update")) return;
    const body = await readJson<{ name?: string; baseStationId?: string; remark?: string }>(request);
    const device = updateDevice({
      id: parts[2],
      name: body.name,
      baseStationId: body.baseStationId,
      remark: body.remark
    });
    if (!device) {
      send(response, 404, { error: "device_not_found" });
      return;
    }
    addAudit(user.id, "device.update", "device", parts[2], auditDetails(body));
    broadcast("device", device);
    send(response, 200, { device });
    return;
  }

  if (method === "GET" && url.pathname === "/api/base-stations") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, { baseStations: listBaseStations() });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "base-stations" && parts[2]) {
    if (!requirePermission(response, user, "device:update")) return;
    const body = await readJson<{ name?: string; firmwareVersion?: string; ipAddress?: string }>(request);
    const baseStation = updateBaseStation({ id: parts[2], ...body });
    if (!baseStation) {
      send(response, 404, { error: "base_station_not_found" });
      return;
    }
    addAudit(user.id, "base_station.update", "base_station", parts[2], auditDetails(body));
    broadcast("base_station", baseStation);
    send(response, 200, { baseStation });
    return;
  }

  if (method === "GET" && url.pathname === "/api/readings") {
    if (!requirePermission(response, user, "device:read")) return;
    const deviceId = url.searchParams.get("deviceId") ?? "ws63-car-001";
    const limit = Number(url.searchParams.get("limit") ?? 120);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const readings = from || to
      ? readingsByTimeRange({ deviceId, from, to, limit })
      : latestReadings(deviceId, limit);
    send(response, 200, { readings });
    return;
  }

  if (method === "GET" && url.pathname === "/api/export/readings.csv") {
    if (!requirePermission(response, user, "device:read")) return;
    sendText(response, 200, "text/csv", readingsCsv(url.searchParams.get("deviceId") ?? "ws63-car-001"), id);
    return;
  }

  if (method === "GET" && url.pathname === "/api/export/audit.csv") {
    if (!requirePermission(response, user, "audit:read")) return;
    sendText(response, 200, "text/csv", auditCsv(), id);
    return;
  }

  if (method === "GET" && url.pathname === "/api/export/summary.json") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, getDashboard(url.searchParams.get("deviceId") ?? "ws63-car-001"));
    return;
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "ingest" && parts[2] === "base-stations" && parts[4] === "telemetry") {
    if (request.headers["x-device-key"] !== ingestKey) {
      send(response, 401, { error: "invalid_device_key" });
      return;
    }
    const baseStationId = parts[3];
    const payload = await readJson<unknown>(request);
    const telemetry = normalizeIncomingTelemetry(payload, baseStationId);
    const result = ingestTelemetryBatch(telemetry);
    const report = createCurrentAgentReport(result.readings[0]?.deviceId ?? telemetry.devices[0]?.deviceId);
    broadcast("telemetry", { readings: result.readings, report });
    addAudit(null, "telemetry.ingest", "base_station", baseStationId, auditDetails(payload, {
      baseStationId,
      count: result.readings.length,
      duplicate: result.duplicate
    }));
    send(response, result.duplicate ? 200 : 201, { readings: result.readings, report, duplicate: result.duplicate });
    return;
  }

  if (method === "GET" && parts[0] === "api" && parts[1] === "base-stations" && parts[3] === "commands" && parts[4] === "pending") {
    if (request.headers["x-device-key"] !== ingestKey) {
      send(response, 401, { error: "invalid_device_key" });
      return;
    }
    const commands = pendingCommands(parts[2]);
    addAudit(null, "command.pull", "base_station", parts[2], auditDetails({}, { count: commands.length }));
    send(response, 200, { commands });
    return;
  }

  if (
    method === "GET" &&
    parts[0] === "api" &&
    parts[1] === "base-stations" &&
    parts[3] === "patrol-tasks" &&
    parts[4] === "pending"
  ) {
    if (request.headers["x-device-key"] !== ingestKey) {
      send(response, 401, { error: "invalid_device_key" });
      return;
    }
    const tasks = pendingPatrolTasks(parts[2]);
    addAudit(null, "patrol.pull", "base_station", parts[2], auditDetails({}, { count: tasks.length }));
    send(response, 200, { tasks });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "commands" && parts[2] && parts[3] === "ack") {
    if (request.headers["x-device-key"] !== ingestKey) {
      send(response, 401, { error: "invalid_device_key" });
      return;
    }
    const body = await readJson<{ status?: "sent" | "executed" | "failed"; errorMessage?: string }>(request);
    const command = acknowledgeCommand(parts[2], body.status ?? "executed", body.errorMessage);
    addAudit(null, "command.ack", "command", parts[2], auditDetails(body, { result: command }));
    broadcast("command", command);
    send(response, 200, { command });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "commands" && parts[2] && parts[3] === "cancel") {
    if (!requirePermission(response, user, "command:create")) return;
    const command = cancelCommand(parts[2]);
    if (!command) {
      send(response, 404, { error: "command_not_found" });
      return;
    }
    addAudit(user.id, "command.cancel", "command", parts[2], auditDetails({}, { result: command }));
    broadcast("command", command);
    send(response, 200, { command });
    return;
  }

  if (method === "GET" && url.pathname === "/api/commands") {
    if (!requirePermission(response, user, "device:read")) return;
    const deviceId = url.searchParams.get("deviceId") ?? "ws63-car-001";
    const limit = Number(url.searchParams.get("limit") ?? 50);
    send(response, 200, { commands: recentCommands(deviceId, limit) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/commands") {
    if (!requirePermission(response, user, "command:create")) return;
    const body = await readJson<{
      deviceId?: string;
      baseStationId?: string;
      action?: "forward" | "backward" | "left" | "right" | "stop" | "drive" | "auto_start" | "auto_return" | "auto_stop";
      speed?: number;
      left?: number;
      right?: number;
      durationMs?: number;
    }>(request);
    const input = {
      deviceId: body.deviceId ?? "ws63-car-001",
      baseStationId: body.baseStationId ?? "sle-base-001",
      action: body.action ?? "stop",
      speed: Number(body.speed ?? 0),
      left: Number(body.left ?? 0),
      right: Number(body.right ?? 0),
      durationMs: Number(body.durationMs ?? 350),
      userId: user.id
    };
    const validation = validateControlInput(input);
    if (!validation.ok) {
      send(response, 400, { error: "invalid_command", field: validation.field, message: validation.message });
      return;
    }
    const command = createCommand(input);
    addAudit(user.id, "command.create", "device", body.deviceId ?? "ws63-car-001", auditDetails(body, { result: command }));
    broadcast("command", command);
    send(response, 201, { command });
    return;
  }

  if (method === "GET" && url.pathname === "/api/patrol-tasks") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, { tasks: listPatrolTasks() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/patrol-tasks") {
    if (!requirePermission(response, user, "task:create")) return;
    const body = await readJson<{ deviceId?: string; baseStationId?: string; name?: string; steps?: unknown }>(request);
    const task = createPatrolTask({
      deviceId: body.deviceId ?? "ws63-car-001",
      baseStationId: body.baseStationId ?? "sle-base-001",
      name: body.name?.trim() || "默认巡检任务",
      steps: parsePatrolSteps(body.steps),
      userId: user.id
    });
    addAudit(user.id, "patrol.create", "device", body.deviceId ?? "ws63-car-001", auditDetails(body, { result: task }));
    broadcast("patrol", task);
    send(response, 201, { task });
    return;
  }

  if (method === "PATCH" && parts[0] === "api" && parts[1] === "patrol-tasks" && parts[2] && parts[3] === "status") {
    const fromBaseStation = request.headers["x-device-key"] === ingestKey;
    if (!fromBaseStation && !requirePermission(response, user, "task:create")) return;
    const body = await readJson<{ status?: "pending" | "pulled" | "running" | "completed" | "failed" | "cancelled"; errorMessage?: string }>(request);
    const status = body.status ?? "running";
    if (!["pending", "pulled", "running", "completed", "failed", "cancelled"].includes(status)) {
      send(response, 400, { error: "invalid_status" });
      return;
    }
    let task: unknown;
    try {
      task = updatePatrolTaskStatus(parts[2], status, body.errorMessage);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("invalid_patrol_transition:")) {
        send(response, 409, { error: "invalid_patrol_transition", transition: error.message.split(":").slice(1) });
        return;
      }
      throw error;
    }
    if (!task) {
      send(response, 404, { error: "task_not_found" });
      return;
    }
    addAudit(user?.id ?? null, "patrol.status", "patrol_task", parts[2], auditDetails(body, { status, fromBaseStation }));
    broadcast("patrol", task);
    send(response, 200, { task });
    return;
  }

  if (method === "GET" && url.pathname === "/api/audit-logs") {
    if (!requirePermission(response, user, "audit:read")) return;
    send(response, 200, { logs: listAuditLogs() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/agent-reports") {
    if (!requirePermission(response, user, "device:read")) return;
    send(response, 200, { reports: latestAgentReports() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/agent/analyze-history") {
    if (!requirePermission(response, user, "device:read")) return;
    const body = await readJson<{
      deviceId?: string;
      range?: { from?: string; to?: string };
      readings?: unknown;
      missingIntervals?: unknown;
      source?: string;
    }>(request);
    const deviceId = body.deviceId ?? "ws63-car-001";
    const range = {
      from: body.range?.from ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: body.range?.to ?? new Date().toISOString()
    };
    const report = await analyzeHistoryReadings({
      deviceId,
      range,
      readings: normalizeUploadedReadings(body.readings, deviceId),
      missingIntervals: normalizeMissingIntervals(body.missingIntervals),
      source: body.source
    });
    addAudit(user.id, "agent.history", "device", deviceId, auditDetails({ ...body, readings: "[app-history]" }, { result: report }));
    broadcast("agent", report);
    send(response, 201, { report });
    return;
  }

  if (method === "POST" && url.pathname === "/api/agent-reports/current") {
    if (!requirePermission(response, user, "device:read")) return;
    const body = await readJson<{ deviceId?: string }>(request);
    const report = createCurrentAgentReport(body.deviceId ?? "ws63-car-001");
    addAudit(user.id, "agent.create", "device", body.deviceId ?? "ws63-car-001", auditDetails(body, { result: report }));
    broadcast("agent", report);
    send(response, 201, { report });
    return;
  }

  send(response, 404, { error: "not_found" });
};

export function createAppServer() {
  return createServer(async (request, response) => {
    const id = requestId(request);
    response.setHeader("X-Request-Id", id);
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const user = getBearerUser(request, url);
      await routes(request, response, url, user);
    } catch (error) {
      send(response, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
