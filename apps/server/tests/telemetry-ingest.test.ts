import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("base station telemetry batch is idempotent by batchId", async () => {
  const app = await createTestApp();
  try {
    const payload = {
      batchId: "batch-001",
      sequence: 7,
      receivedAt: "2026-07-06T10:00:00.000Z",
      link: { rssi: -61, cachedCount: 2, mode: "sle" },
      devices: [
        { deviceId: "ws63-car-001", temperature: 27.1, humidity: 51.2, lightness: 800, gear: "D", direction: "forward", status: "moving" }
      ]
    };

    for (let index = 0; index < 2; index += 1) {
      const response = await fetch(`${app.baseUrl}/api/ingest/base-stations/sle-base-001/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, index === 0 ? 201 : 200);
    }

    const token = await app.login();
    const readings = await fetch(`${app.baseUrl}/api/readings?deviceId=ws63-car-001&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await readings.json() as { readings: unknown[] };
    assert.equal(body.readings.length, 1);
  } finally {
    await app.close();
  }
});
