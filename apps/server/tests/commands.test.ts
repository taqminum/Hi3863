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
    assert.deepEqual(JSON.parse(pendingBody.commands[0].payload), {
      cmd: "forward",
      speed: 60,
      duration_ms: 350
    });
  } finally {
    await app.close();
  }
});

test("joystick drive command is downgraded to current car motion payload", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: "ws63-car-001",
        baseStationId: "sle-base-001",
        action: "drive",
        left: 70,
        right: 0,
        durationMs: 350
      })
    });
    assert.equal(created.status, 201);

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/commands/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    assert.equal(pending.status, 200);
    const pendingBody = await pending.json() as { commands: Array<{ action: string; speed: number; payload: string }> };
    assert.equal(pendingBody.commands[0].action, "drive");
    assert.equal(pendingBody.commands[0].speed, 0);
    assert.deepEqual(JSON.parse(pendingBody.commands[0].payload), {
      cmd: "right",
      speed: 70,
      duration_ms: 350
    });
  } finally {
    await app.close();
  }
});

test("command creation rejects invalid drive payload", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const invalid = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "drive", left: 140, right: 0, durationMs: 350 })
    });
    assert.equal(invalid.status, 400);
    const body = await invalid.json() as { error: string; field: string };
    assert.equal(body.error, "invalid_command");
    assert.equal(body.field, "left");
  } finally {
    await app.close();
  }
});

test("new drive command cancels stale pending drive command for same device", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    for (const left of [30, 60]) {
      const created = await fetch(`${app.baseUrl}/api/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "drive", left, right: left, durationMs: 350 })
      });
      assert.equal(created.status, 201);
    }

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/commands/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    assert.equal(pending.status, 200);
    const body = await pending.json() as { commands: Array<{ payload: string }> };
    assert.deepEqual(body.commands.map((command) => JSON.parse(command.payload)), [
      { cmd: "forward", speed: 60, duration_ms: 350 }
    ]);
  } finally {
    await app.close();
  }
});

test("stop command suppresses stale pending drive commands", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const drive = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "drive", left: 70, right: 70, durationMs: 350 })
    });
    assert.equal(drive.status, 201);
    const stop = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "stop", speed: 0 })
    });
    assert.equal(stop.status, 201);

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/commands/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    const body = await pending.json() as { commands: Array<{ payload: string }> };
    assert.deepEqual(body.commands.map((command) => JSON.parse(command.payload)), [
      { cmd: "stop", speed: 0, duration_ms: 0 }
    ]);
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
