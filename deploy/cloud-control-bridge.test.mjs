import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";

import { createTestApp } from "../apps/server/tests/helpers.ts";
import { acknowledgeCommandResult, bridgeControlOnce, pollPendingCommands, sendGatewayCommand } from "./cloud-control-bridge-lib.mjs";

test("pollPendingCommands fetches queued control messages", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "forward", speed: 60 })
    });
    assert.equal(created.status, 201);

    const pending = await pollPendingCommands({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey
    });

    assert.equal(pending.commands.length, 1);
    assert.deepEqual(JSON.parse(pending.commands[0].payload), {
      cmd: "forward",
      speed: 60,
      duration_ms: 350
    });
  } finally {
    await app.close();
  }
});

test("sendGatewayCommand forwards payload over UDP", async () => {
  const server = dgram.createSocket("udp4");
  await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));

  const received = new Promise((resolve) => {
    server.once("message", (message) => resolve(message.toString("utf8")));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing udp address");

    await sendGatewayCommand({
      gatewayHost: "127.0.0.1",
      gatewayPort: address.port,
      payload: "{\"cmd\":\"stop\",\"speed\":0,\"duration_ms\":0}",
      timeoutMs: 1000
    });

    assert.equal(await received, "{\"cmd\":\"stop\",\"speed\":0,\"duration_ms\":0}");
  } finally {
    server.close();
  }
});

test("acknowledgeCommandResult stores executed status", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "stop", speed: 0 })
    });
    const createdBody = await created.json();

    const ack = await acknowledgeCommandResult({
      cloudBaseUrl: app.baseUrl,
      commandId: createdBody.command.id,
      deviceKey: app.deviceKey,
      status: "executed"
    });

    assert.equal(ack.command.status, "executed");
  } finally {
    await app.close();
  }
});

test("bridgeControlOnce forwards one pending command and acks it", async () => {
  const app = await createTestApp();
  const server = dgram.createSocket("udp4");
  await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));

  const received = new Promise((resolve) => {
    server.once("message", (message, remote) => {
      server.send(Buffer.from("{\"seq\":99,\"temp_x10\":250,\"humi_x10\":500,\"light_x10\":900,\"motion\":0,\"patrol\":0,\"err\":0}", "utf8"), remote.port, remote.address);
      resolve(message.toString("utf8"));
    });
  });

  try {
    const token = await app.login("operator", "operator123");
    const created = await fetch(`${app.baseUrl}/api/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "left", speed: 50 })
    });
    assert.equal(created.status, 201);

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing udp address");

    const result = await bridgeControlOnce({
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey,
      gatewayHost: "127.0.0.1",
      gatewayPort: address.port,
      timeoutMs: 1000
    });

    assert.equal(await received, "{\"cmd\":\"left\",\"speed\":50,\"duration_ms\":350}");
    assert.equal(result.processed.length, 1);
    assert.equal(result.processed[0].ack.command.status, "executed");
  } finally {
    server.close();
    await app.close();
  }
});
