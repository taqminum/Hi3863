import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("health remains plain JSON for external smoke checks", async () => {
  const app = await createTestApp();
  try {
    const response = await fetch(`${app.baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean };
    assert.equal(body.ok, true);
  } finally {
    await app.close();
  }
});

test("dashboard keeps backward-compatible top-level arrays", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const response = await fetch(`${app.baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(Array.isArray(body.devices), true);
    assert.equal(Array.isArray(body.baseStations), true);
    assert.equal(Array.isArray(body.readings), true);
    assert.equal(Array.isArray(body.recentCommands), true);
    assert.equal(Array.isArray(body.recentTasks), true);
    assert.equal(Array.isArray(body.agentReports), true);
  } finally {
    await app.close();
  }
});

test("SSE events endpoint exposes CORS headers for web clients", async () => {
  const app = await createTestApp();
  const controller = new AbortController();
  try {
    const token = await app.login();
    const response = await fetch(`${app.baseUrl}/api/events?token=${encodeURIComponent(token)}`, {
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  } finally {
    controller.abort();
    await app.close();
  }
});
