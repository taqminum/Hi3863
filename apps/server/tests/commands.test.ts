import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("base station pull leases pending commands", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: "ws63-car-001", baseStationId: "sle-base-001", action: "forward", speed: 60 })
    });
    assert.equal(created.status, 201);

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/commands/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    assert.equal(pending.status, 200);
    const pendingBody = await pending.json() as { commands: Array<{ id: string; status: string; payload: string }> };
    assert.equal(pendingBody.commands[0].status, "pulled");
    assert.equal(pendingBody.commands[0].payload, "FORWARD:60");
  } finally {
    await app.close();
  }
});

test("failed command ack stores error message", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "backward", speed: 20 })
    });
    const createdBody = await created.json() as { command: { id: string } };

    const ack = await fetch(`${app.baseUrl}/api/commands/${createdBody.command.id}/ack`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
      body: JSON.stringify({ status: "failed", errorMessage: "SLE timeout" })
    });
    assert.equal(ack.status, 200);
    const ackBody = await ack.json() as { command: { status: string; error_message: string } };
    assert.equal(ackBody.command.status, "failed");
    assert.equal(ackBody.command.error_message, "SLE timeout");
  } finally {
    await app.close();
  }
});
