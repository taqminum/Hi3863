import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "ws63-migrations-")), "test.sqlite");

const { db, initDb } = await import("../src/db.ts");

test("initDb records schema migrations exactly once", () => {
  initDb();
  initDb();
  const rows = db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{
    version: number;
    name: string;
  }>;
  assert.deepEqual(rows.map((row) => row.version), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(rows[0].name, "initial_schema");
  assert.equal(rows[1].name, "contest_fields");
  assert.equal(rows[2].name, "device_lifecycle_fields");
  assert.equal(rows[3].name, "ingest_batches");
  assert.equal(rows[4].name, "command_lifecycle_fields");
  assert.equal(rows[5].name, "patrol_lifecycle_fields");
  assert.equal(rows[6].name, "agent_evidence");
});
