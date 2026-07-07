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
