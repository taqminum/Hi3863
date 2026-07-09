import type { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function rebuildNullableRssiTables(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    ALTER TABLE base_stations RENAME TO base_stations_old;
    CREATE TABLE base_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      network_status TEXT NOT NULL,
      last_heartbeat TEXT NOT NULL,
      last_rssi INTEGER,
      cached_count INTEGER NOT NULL DEFAULT 0,
      firmware_version TEXT,
      ip_address TEXT,
      updated_at TEXT
    );
    INSERT INTO base_stations (
      id, name, status, network_status, last_heartbeat, last_rssi, cached_count,
      firmware_version, ip_address, updated_at
    )
    SELECT
      id, name, status, network_status, last_heartbeat,
      CASE WHEN last_rssi = -45 THEN NULL ELSE last_rssi END,
      cached_count, firmware_version, ip_address, updated_at
    FROM base_stations_old;
    DROP TABLE base_stations_old;

    ALTER TABLE sensor_readings RENAME TO sensor_readings_old;
    CREATE TABLE sensor_readings (
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
      rssi INTEGER,
      cached_count INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    );
    INSERT INTO sensor_readings (
      id, device_id, base_station_id, temperature, humidity, lightness, gear,
      direction, status, link_mode, rssi, cached_count, recorded_at
    )
    SELECT
      id, device_id, base_station_id, temperature, humidity, lightness, gear,
      direction, status, link_mode,
      CASE WHEN rssi = -45 THEN NULL ELSE rssi END,
      cached_count, recorded_at
    FROM sensor_readings_old;
    DROP TABLE sensor_readings_old;

    PRAGMA foreign_keys = ON;
  `);
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migrations: Migration[] = [
    {
      version: 1,
      name: "initial_schema",
      up(database) {
        database.exec("SELECT 1");
      }
    },
    {
      version: 2,
      name: "contest_fields",
      up(database) {
        ensureColumn(database, "base_stations", "last_rssi", "INTEGER NOT NULL DEFAULT -45");
        ensureColumn(database, "base_stations", "cached_count", "INTEGER NOT NULL DEFAULT 0");
        ensureColumn(database, "devices", "remark", "TEXT NOT NULL DEFAULT ''");
        ensureColumn(database, "control_commands", "error_message", "TEXT");
        ensureColumn(database, "patrol_tasks", "started_at", "TEXT");
        ensureColumn(database, "patrol_tasks", "finished_at", "TEXT");
      }
    },
    {
      version: 3,
      name: "device_lifecycle_fields",
      up(database) {
        ensureColumn(database, "devices", "offline_reason", "TEXT");
        ensureColumn(database, "devices", "updated_at", "TEXT");
        ensureColumn(database, "base_stations", "firmware_version", "TEXT");
        ensureColumn(database, "base_stations", "ip_address", "TEXT");
        ensureColumn(database, "base_stations", "updated_at", "TEXT");
      }
    },
    {
      version: 4,
      name: "ingest_batches",
      up(database) {
        database.exec(`
          CREATE TABLE IF NOT EXISTS ingest_batches (
            id TEXT PRIMARY KEY,
            base_station_id TEXT NOT NULL,
            sequence INTEGER,
            reading_count INTEGER NOT NULL,
            received_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
      }
    },
    {
      version: 5,
      name: "command_lifecycle_fields",
      up(database) {
        ensureColumn(database, "control_commands", "pulled_at", "TEXT");
        ensureColumn(database, "control_commands", "expires_at", "TEXT");
        ensureColumn(database, "control_commands", "cancelled_at", "TEXT");
      }
    },
    {
      version: 6,
      name: "patrol_lifecycle_fields",
      up(database) {
        ensureColumn(database, "patrol_tasks", "pulled_at", "TEXT");
        ensureColumn(database, "patrol_tasks", "error_message", "TEXT");
      }
    },
    {
      version: 7,
      name: "agent_evidence",
      up(database) {
        ensureColumn(database, "agent_reports", "evidence_json", "TEXT NOT NULL DEFAULT '[]'");
      }
    },
    {
      version: 8,
      name: "nullable_measured_rssi",
      up(database) {
        rebuildNullableRssiTables(database);
      }
    }
  ];

  for (const migration of migrations) {
    const existing = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version);
    if (existing) continue;
    migration.up(db);
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      migration.version,
      migration.name,
      nowIso()
    );
  }
}
