import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("viewer can export readings CSV but cannot export audit CSV", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("viewer", "viewer123");
    const readings = await fetch(`${app.baseUrl}/api/export/readings.csv?deviceId=ws63-car-001`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(readings.status, 200);
    assert.match(readings.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(await readings.text(), /device_id,base_station_id,temperature/);

    const audit = await fetch(`${app.baseUrl}/api/export/audit.csv`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(audit.status, 403);
  } finally {
    await app.close();
  }
});
