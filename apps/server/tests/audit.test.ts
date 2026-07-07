import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("device update writes audit log with actor role", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const response = await fetch(`${app.baseUrl}/api/devices/ws63-car-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Request-Id": "audit-test-001" },
      body: JSON.stringify({ name: "审计车辆", baseStationId: "sle-base-001", remark: "audit-check" })
    });
    assert.equal(response.status, 200);

    const logs = await fetch(`${app.baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await logs.json() as { logs: Array<{ action: string; details_json: string }> };
    const log = body.logs.find((item) => item.action === "device.update");
    assert.ok(log);
    const details = JSON.parse(log.details_json) as { requestId: string; actorRole: string; input: { remark: string } };
    assert.equal(details.requestId, "audit-test-001");
    assert.equal(details.actorRole, "admin");
    assert.equal(details.input.remark, "audit-check");
  } finally {
    await app.close();
  }
});
