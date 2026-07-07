import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./auth.ts";
import type { BaseStationTelemetry, ControlInput, PatrolStep, SensorReading } from "./domain.ts";
import { createAgentReport, normalizeTelemetry, toCarControlPayload } from "./domain.ts";
import { runMigrations } from "./migrations.ts";
import type { SessionUser, User } from "./types.ts";

const dbPath = resolve(process.env.DB_PATH ?? "data/ws63-platform.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

function nowIso(): string {
  return new Date().toISOString();
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS base_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      network_status TEXT NOT NULL,
      last_heartbeat TEXT NOT NULL,
      last_rssi INTEGER NOT NULL DEFAULT -45,
      cached_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_station_id TEXT NOT NULL,
      status TEXT NOT NULL,
      connection_mode TEXT NOT NULL,
      direct_url TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sensor_readings (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      base_station_id TEXT NOT NULL,
      temperature REAL NOT NULL,
      humidity REAL NOT NULL,
      lightness INTEGER NOT NULL,
      gear TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      link_mode TEXT NOT NULL,
      rssi INTEGER NOT NULL,
      cached_count INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      base_station_id TEXT NOT NULL,
      action TEXT NOT NULL,
      speed INTEGER NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS patrol_tasks (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      base_station_id TEXT NOT NULL,
      name TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_reports (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      summary TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  `);

  runMigrations(db);
  seedDefaults();
}

function seedDefaults(): void {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count as number;
  if (!userCount) {
    db.prepare(
      "INSERT INTO users (id, username, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("user-admin", "admin", "系统管理员", "admin", hashPassword("admin123"), nowIso());
    db.prepare(
      "INSERT INTO users (id, username, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("user-operator", "operator", "巡检操作员", "operator", hashPassword("operator123"), nowIso());
    db.prepare(
      "INSERT INTO users (id, username, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("user-viewer", "viewer", "观察员", "viewer", hashPassword("viewer123"), nowIso());
  }

  db.prepare(
    `INSERT OR IGNORE INTO base_stations (id, name, status, network_status, last_heartbeat)
     VALUES (?, ?, ?, ?, ?)`
  ).run("sle-base-001", "星闪基站 001", "online", "cloud-online", nowIso());

  db.prepare(
    `INSERT OR IGNORE INTO devices (id, name, base_station_id, status, connection_mode, direct_url, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run("ws63-car-001", "WS63 环境巡检小车 001", "sle-base-001", "online", "sle-gateway", "http://192.168.43.1:8080", nowIso());
}

export function publicUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role as User["role"]
  };
}

export function findUserByUsername(username: string): SessionUser | null {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return null;
  return { ...publicUser(row), passwordHash: String(row.password_hash) };
}

export function listUsers(): User[] {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(publicUser);
}

export function listDevices(): unknown[] {
  return db
    .prepare(
      `SELECT d.*, b.name AS base_station_name
       FROM devices d
       LEFT JOIN base_stations b ON b.id = d.base_station_id
       ORDER BY d.id ASC`
    )
    .all();
}

export function updateDevice(input: { id: string; name?: string; baseStationId?: string; remark?: string }): unknown {
  const current = db.prepare("SELECT * FROM devices WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
  if (!current) return null;
  db.prepare("UPDATE devices SET name = ?, base_station_id = ?, remark = ? WHERE id = ?").run(
    input.name?.trim() || current.name,
    input.baseStationId?.trim() || current.base_station_id,
    input.remark ?? current.remark ?? "",
    input.id
  );
  return listDevices().find((device) => (device as { id?: string }).id === input.id) ?? null;
}

export function listBaseStations(): unknown[] {
  return db.prepare("SELECT * FROM base_stations ORDER BY id ASC").all();
}

export function updateBaseStation(input: { id: string; name?: string; firmwareVersion?: string; ipAddress?: string }): unknown {
  const current = db.prepare("SELECT * FROM base_stations WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
  if (!current) return null;
  db.prepare("UPDATE base_stations SET name = ?, firmware_version = ?, ip_address = ?, updated_at = ? WHERE id = ?").run(
    input.name?.trim() || current.name,
    input.firmwareVersion?.trim() || current.firmware_version || null,
    input.ipAddress?.trim() || current.ip_address || null,
    nowIso(),
    input.id
  );
  return db.prepare("SELECT * FROM base_stations WHERE id = ?").get(input.id);
}

export function updateDeviceStatus(input: { id: string; status: "online" | "offline" | "idle" | "fault"; reason?: string }): unknown {
  const current = db.prepare("SELECT * FROM devices WHERE id = ?").get(input.id);
  if (!current) return null;
  db.prepare("UPDATE devices SET status = ?, offline_reason = ?, updated_at = ? WHERE id = ?").run(
    input.status,
    input.status === "offline" || input.status === "fault" ? input.reason ?? null : null,
    nowIso(),
    input.id
  );
  return listDevices().find((device) => (device as { id?: string }).id === input.id) ?? null;
}

export function latestReadings(deviceId = "ws63-car-001", limit = 120): SensorReading[] {
  return db
    .prepare(
      `SELECT id, device_id, base_station_id, temperature, humidity, lightness, gear, direction, status,
              link_mode, rssi, cached_count, recorded_at
       FROM sensor_readings
       WHERE device_id = ?
       ORDER BY recorded_at DESC
       LIMIT ?`
    )
    .all(deviceId, limit)
    .reverse()
    .map(rowToReading);
}

function rowToReading(row: Record<string, unknown>): SensorReading {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    baseStationId: String(row.base_station_id),
    temperature: Number(row.temperature),
    humidity: Number(row.humidity),
    lightness: Number(row.lightness),
    gear: String(row.gear),
    direction: String(row.direction),
    status: String(row.status),
    linkMode: String(row.link_mode),
    rssi: Number(row.rssi),
    cachedCount: Number(row.cached_count),
    recordedAt: String(row.recorded_at)
  };
}

export function ingestTelemetry(payload: BaseStationTelemetry): SensorReading[] {
  const readings = normalizeTelemetry(payload);
  for (const reading of readings) {
    db.prepare(
      `INSERT OR REPLACE INTO sensor_readings
       (id, device_id, base_station_id, temperature, humidity, lightness, gear, direction, status,
        link_mode, rssi, cached_count, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reading.id,
      reading.deviceId,
      reading.baseStationId,
      reading.temperature,
      reading.humidity,
      reading.lightness,
      reading.gear,
      reading.direction,
      reading.status,
      reading.linkMode,
      reading.rssi,
      reading.cachedCount,
      reading.recordedAt
    );

    db.prepare("UPDATE devices SET status = ?, last_seen = ? WHERE id = ?").run("online", reading.recordedAt, reading.deviceId);
    db.prepare(
      "UPDATE base_stations SET status = ?, network_status = ?, last_heartbeat = ?, last_rssi = ?, cached_count = ? WHERE id = ?"
    ).run(
      "online",
      "cloud-online",
      reading.recordedAt,
      reading.rssi,
      reading.cachedCount,
      reading.baseStationId
    );
  }
  return readings;
}

export function ingestTelemetryBatch(payload: BaseStationTelemetry): { readings: SensorReading[]; duplicate: boolean } {
  const batchId = payload.batchId?.trim();
  if (batchId) {
    const existing = db.prepare("SELECT id FROM ingest_batches WHERE id = ?").get(batchId);
    if (existing) {
      return { readings: [], duplicate: true };
    }
  }

  const readings = ingestTelemetry(payload);
  if (batchId) {
    db.prepare(
      "INSERT INTO ingest_batches (id, base_station_id, sequence, reading_count, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(batchId, payload.baseStationId, payload.sequence ?? null, readings.length, payload.receivedAt ?? nowIso(), nowIso());
  }
  return { readings, duplicate: false };
}

export function createCommand(input: ControlInput & { deviceId: string; baseStationId: string; userId: string }): unknown {
  const id = `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const speed = input.action === "stop" ? 0 : Math.max(0, Math.min(100, Math.round(input.speed)));
  const payload = toCarControlPayload({ action: input.action, speed });
  db.prepare(
    `INSERT INTO control_commands
     (id, device_id, base_station_id, action, speed, payload, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.deviceId, input.baseStationId, input.action, speed, payload, "pending", input.userId, nowIso());
  return getCommand(id);
}

export function pendingCommands(baseStationId: string): unknown[] {
  const pulledAt = nowIso();
  const rows = db
    .prepare("SELECT * FROM control_commands WHERE base_station_id = ? AND status = ? ORDER BY created_at ASC")
    .all(baseStationId, "pending") as Array<{ id: string }>;
  for (const row of rows) {
    db.prepare("UPDATE control_commands SET status = ?, pulled_at = ? WHERE id = ?").run("pulled", pulledAt, row.id);
  }
  return rows.map((row) => getCommand(row.id));
}

export function recentCommands(deviceId = "ws63-car-001", limit = 50): unknown[] {
  return db
    .prepare("SELECT * FROM control_commands WHERE device_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(deviceId, Math.max(1, Math.min(200, Math.round(limit))));
}

export function acknowledgeCommand(commandId: string, status: "sent" | "executed" | "failed", errorMessage?: string): unknown {
  db.prepare("UPDATE control_commands SET status = ?, acknowledged_at = ?, error_message = ? WHERE id = ?").run(
    status,
    nowIso(),
    errorMessage ?? null,
    commandId
  );
  return getCommand(commandId);
}

export function cancelCommand(commandId: string): unknown {
  db.prepare("UPDATE control_commands SET status = ?, cancelled_at = ? WHERE id = ? AND status IN ('pending', 'pulled')").run(
    "cancelled",
    nowIso(),
    commandId
  );
  return getCommand(commandId);
}

function getCommand(id: string): unknown {
  return db.prepare("SELECT * FROM control_commands WHERE id = ?").get(id);
}

export function createPatrolTask(input: {
  deviceId: string;
  baseStationId: string;
  name: string;
  steps: PatrolStep[];
  userId: string;
}): unknown {
  const id = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  db.prepare(
    `INSERT INTO patrol_tasks
     (id, device_id, base_station_id, name, steps_json, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.deviceId, input.baseStationId, input.name, json(input.steps), "pending", input.userId, nowIso());
  return db.prepare("SELECT * FROM patrol_tasks WHERE id = ?").get(id);
}

export function listPatrolTasks(): unknown[] {
  return db.prepare("SELECT * FROM patrol_tasks ORDER BY created_at DESC LIMIT 50").all();
}

export function pendingPatrolTasks(baseStationId: string): unknown[] {
  const pulledAt = nowIso();
  const rows = db
    .prepare("SELECT * FROM patrol_tasks WHERE base_station_id = ? AND status = ? ORDER BY created_at ASC")
    .all(baseStationId, "pending") as Array<{ id: string }>;
  for (const row of rows) {
    db.prepare("UPDATE patrol_tasks SET status = ?, pulled_at = ? WHERE id = ?").run("pulled", pulledAt, row.id);
  }
  return rows.map((row) => db.prepare("SELECT * FROM patrol_tasks WHERE id = ?").get(row.id));
}

export function updatePatrolTaskStatus(
  taskId: string,
  status: "pending" | "pulled" | "running" | "completed" | "failed" | "cancelled",
  errorMessage?: string
): unknown {
  const current = db.prepare("SELECT * FROM patrol_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
  if (!current) return null;
  const allowed: Record<string, string[]> = {
    pending: ["pulled", "running", "cancelled"],
    pulled: ["running", "failed", "cancelled"],
    running: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: []
  };
  if (!allowed[String(current.status)]?.includes(status)) {
    throw new Error(`invalid_patrol_transition:${current.status}:${status}`);
  }
  const startedAt = status === "running" && !current.started_at ? nowIso() : current.started_at;
  const finishedAt = status === "completed" || status === "failed" ? nowIso() : current.finished_at;
  db.prepare("UPDATE patrol_tasks SET status = ?, started_at = ?, finished_at = ?, error_message = ? WHERE id = ?").run(
    status,
    startedAt ?? null,
    finishedAt ?? null,
    errorMessage ?? current.error_message ?? null,
    taskId
  );
  return db.prepare("SELECT * FROM patrol_tasks WHERE id = ?").get(taskId);
}

export function addAudit(userId: string | null, action: string, targetType: string, targetId: string | null, details: unknown): void {
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(`audit-${Date.now()}-${Math.random().toString(16).slice(2)}`, userId, action, targetType, targetId, json(details), nowIso());
}

export function listAuditLogs(): unknown[] {
  return db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").all();
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows: unknown[], headers: string[]): string {
  return [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape((row as Record<string, unknown>)[key])).join(","))].join("\n");
}

export function readingsCsv(deviceId = "ws63-car-001"): string {
  const rows = db.prepare("SELECT * FROM sensor_readings WHERE device_id = ? ORDER BY recorded_at DESC LIMIT 1000").all(deviceId);
  return rowsToCsv(rows, ["device_id", "base_station_id", "temperature", "humidity", "lightness", "rssi", "cached_count", "recorded_at"]);
}

export function auditCsv(): string {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000").all();
  return rowsToCsv(rows, ["id", "user_id", "action", "target_type", "target_id", "details_json", "created_at"]);
}

export function createCurrentAgentReport(deviceId = "ws63-car-001"): unknown {
  const report = createAgentReport(latestReadings(deviceId, 40));
  const id = `agent-${Date.now()}`;
  db.prepare(
    `INSERT INTO agent_reports (id, device_id, risk_level, summary, suggestions_json, evidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, deviceId, report.riskLevel, report.summary, json(report.suggestions), json(report.evidence), nowIso());
  return { id, deviceId, ...report, createdAt: nowIso() };
}

export function latestAgentReports(): unknown[] {
  return db.prepare("SELECT * FROM agent_reports ORDER BY created_at DESC LIMIT 20").all();
}

export function getDashboard(deviceId = "ws63-car-001"): unknown {
  return {
    devices: listDevices(),
    baseStations: listBaseStations(),
    readings: latestReadings(deviceId, 80),
    recentCommands: recentCommands(deviceId, 10),
    recentTasks: listPatrolTasks(),
    agentReports: latestAgentReports()
  };
}
