import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("base station pulling patrol task marks it pulled", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "验收巡检", steps: [{ action: "forward", speed: 40, durationMs: 1200 }] })
    });
    assert.equal(created.status, 201);

    const pending = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001/patrol-tasks/pending`, {
      headers: { "X-Device-Key": app.deviceKey }
    });
    assert.equal(pending.status, 200);
    const body = await pending.json() as { tasks: Array<{ status: string }> };
    assert.equal(body.tasks[0].status, "pulled");
  } finally {
    await app.close();
  }
});

test("patrol task cannot move from completed back to running", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "状态机巡检", steps: [{ action: "stop", speed: 0, durationMs: 1000 }] })
    });
    const createdBody = await created.json() as { task: { id: string } };

    for (const status of ["running", "completed"]) {
      const response = await fetch(`${app.baseUrl}/api/patrol-tasks/${createdBody.task.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
        body: JSON.stringify({ status })
      });
      assert.equal(response.status, 200);
    }

    const invalid = await fetch(`${app.baseUrl}/api/patrol-tasks/${createdBody.task.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
      body: JSON.stringify({ status: "running" })
    });
    assert.equal(invalid.status, 409);
  } finally {
    await app.close();
  }
});
