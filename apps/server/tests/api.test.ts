import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("dashboard returns single-call operational summary", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const response = await fetch(`${app.baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    const data = await response.json() as Record<string, unknown>;
    assert.equal(Array.isArray(data.devices), true);
    assert.equal(Array.isArray(data.baseStations), true);
    assert.equal(Array.isArray(data.readings), true);
    assert.equal(Array.isArray(data.recentCommands), true);
    assert.equal(Array.isArray(data.recentTasks), true);
    assert.equal(Array.isArray(data.agentReports), true);
  } finally {
    await app.close();
  }
});

test("admin can update device metadata and command history is visible", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const update = await fetch(`${app.baseUrl}/api/devices/ws63-car-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "WS63 一号车", baseStationId: "sle-base-001", remark: "比赛演示车辆" })
    });
    assert.equal(update.status, 200);
    const updated = await update.json() as { device: { name: string; remark: string } };
    assert.equal(updated.device.name, "WS63 一号车");
    assert.equal(updated.device.remark, "比赛演示车辆");

    const command = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: "ws63-car-001", baseStationId: "sle-base-001", action: "forward", speed: 66 })
    });
    assert.equal(command.status, 201);

    const history = await fetch(`${app.baseUrl}/api/commands?deviceId=ws63-car-001`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(history.status, 200);
    const historyBody = await history.json() as { commands: Array<{ payload: string }> };
    assert.equal(historyBody.commands[0].payload, "FORWARD:66");
  } finally {
    await app.close();
  }
});

test("base station can fetch pending patrol tasks and update task status", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: "ws63-car-001",
        baseStationId: "sle-base-001",
        name: "测试巡检",
        steps: [{ action: "forward", speed: 40, durationMs: 1200 }]
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { task: { id: string } };

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/patrol-tasks/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    assert.equal(pending.status, 200);
    const pendingBody = await pending.json() as { tasks: Array<{ id: string }> };
    assert.equal(pendingBody.tasks[0].id, createdBody.task.id);

    const status = await fetch(`${app.baseUrl}/api/patrol-tasks/${createdBody.task.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
      body: JSON.stringify({ status: "running" })
    });
    assert.equal(status.status, 200);
    const statusBody = await status.json() as { task: { status: string; started_at: string } };
    assert.equal(statusBody.task.status, "running");
    assert.match(statusBody.task.started_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await app.close();
  }
});
