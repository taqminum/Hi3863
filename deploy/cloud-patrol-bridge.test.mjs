import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";

import { createTestApp } from "../apps/server/tests/helpers.ts";
import {
  bridgePatrolOnce,
  pollPendingPatrolTasks,
  updatePatrolTaskStatus
} from "./cloud-patrol-bridge-lib.mjs";
import {
  buildPatrolBridgeUsage,
  parsePatrolBridgeArgs,
  validatePatrolBridgeOptions
} from "./cloud-patrol-bridge-cli.mjs";

test("parsePatrolBridgeArgs reads CLI flags and environment defaults", () => {
  const options = parsePatrolBridgeArgs(
    ["--gateway-host", "192.168.5.118", "--cloud-base-url", "http://127.0.0.1:8787", "--once"],
    {
      DEVICE_INGEST_KEY: "dev-key",
      WS63_BASE_STATION_ID: "base-a",
      WS63_PATROL_BRIDGE_INTERVAL_MS: "1200"
    }
  );

  assert.equal(options.gatewayHost, "192.168.5.118");
  assert.equal(options.cloudBaseUrl, "http://127.0.0.1:8787");
  assert.equal(options.deviceKey, "dev-key");
  assert.equal(options.baseStationId, "base-a");
  assert.equal(options.intervalMs, 1200);
  assert.equal(options.once, true);
});

test("validatePatrolBridgeOptions rejects missing device key", () => {
  assert.throws(
    () => validatePatrolBridgeOptions(parsePatrolBridgeArgs([], {})),
    /Missing device key/
  );
  assert.match(buildPatrolBridgeUsage(), /bridge:patrol/);
});

test("pollPendingPatrolTasks fetches queued patrol tasks", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Greenhouse row A",
        steps: [{ action: "forward", speed: 40, durationMs: 1200 }]
      })
    });
    assert.equal(created.status, 201);

    const pending = await pollPendingPatrolTasks({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey
    });

    assert.equal(pending.tasks.length, 1);
    assert.equal(pending.tasks[0].name, "Greenhouse row A");
    assert.equal(pending.tasks[0].status, "pulled");
  } finally {
    await app.close();
  }
});

test("updatePatrolTaskStatus stores lifecycle state", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ steps: [{ action: "stop", speed: 0, durationMs: 500 }] })
    });
    const createdBody = await created.json();

    await pollPendingPatrolTasks({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey
    });

    const running = await updatePatrolTaskStatus({
      cloudBaseUrl: app.baseUrl,
      taskId: createdBody.task.id,
      deviceKey: app.deviceKey,
      status: "running"
    });
    const completed = await updatePatrolTaskStatus({
      cloudBaseUrl: app.baseUrl,
      taskId: createdBody.task.id,
      deviceKey: app.deviceKey,
      status: "completed"
    });

    assert.equal(running.task.status, "running");
    assert.equal(completed.task.status, "completed");
  } finally {
    await app.close();
  }
});

test("bridgePatrolOnce sends each patrol step and completes the task", async () => {
  const app = await createTestApp();
  const server = dgram.createSocket("udp4");
  await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));

  const messages = [];
  server.on("message", (message) => {
    messages.push(message.toString("utf8"));
  });

  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Two-step patrol",
        steps: [
          { action: "forward", speed: 45, durationMs: 700 },
          { action: "right", speed: 60, durationMs: 500 }
        ]
      })
    });
    assert.equal(created.status, 201);

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing udp address");

    const result = await bridgePatrolOnce({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey,
      gatewayHost: "127.0.0.1",
      gatewayPort: address.port,
      timeoutMs: 1000,
      stepDelayMs: 1
    });

    assert.deepEqual(messages, [
      "{\"cmd\":\"forward\",\"speed\":45,\"duration_ms\":700}",
      "{\"cmd\":\"right\",\"speed\":60,\"duration_ms\":500}"
    ]);
    assert.equal(result.processed.length, 1);
    assert.equal(result.processed[0].completed.task.status, "completed");
  } finally {
    server.close();
    await app.close();
  }
});

test("bridgePatrolOnce marks task failed when a step cannot be sent", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/patrol-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Failing patrol",
        steps: [{ action: "forward", speed: 40, durationMs: 600 }]
      })
    });
    assert.equal(created.status, 201);

    const result = await bridgePatrolOnce({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey,
      gatewayHost: "127.0.0.1",
      gatewayPort: 1,
      timeoutMs: 50,
      sendStep: async () => {
        throw new Error("simulated UDP failure");
      }
    });

    assert.equal(result.processed.length, 1);
    assert.equal(result.processed[0].failed.task.status, "failed");
    assert.match(result.processed[0].failed.task.error_message, /simulated UDP failure/);
  } finally {
    await app.close();
  }
});
