import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";

import { createTestApp } from "../apps/server/tests/helpers.ts";
import { bridgeOnce, buildRawTelemetryPayload, pollGatewayTelemetry } from "./cloud-bridge-lib.mjs";
import { buildUsage, parseBridgeArgs, validateBridgeOptions } from "./cloud-bridge-cli.mjs";

test("buildRawTelemetryPayload adds receivedAt and optional deviceId", () => {
  const payload = buildRawTelemetryPayload(
    { seq: 7, temp_x10: 253, humi_x10: 618, light_x10: 845, motion: 1, patrol: 0, err: 0 },
    { deviceId: "ws63-car-009", receivedAt: "2026-07-08T12:00:00.000Z" }
  );

  assert.equal(payload.seq, 7);
  assert.equal(payload.deviceId, "ws63-car-009");
  assert.equal(payload.receivedAt, "2026-07-08T12:00:00.000Z");
  assert.equal(payload.temp_x10, 253);
});

test("pollGatewayTelemetry sends GET and parses JSON reply", async () => {
  const server = dgram.createSocket("udp4");
  const telemetry = { seq: 11, temp_x10: 301, humi_x10: 520, light_x10: 999, motion: 0, patrol: 0, err: 0 };

  await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));
  server.on("message", (message, remote) => {
    assert.equal(message.toString("utf8"), "GET");
    server.send(Buffer.from(JSON.stringify(telemetry), "utf8"), remote.port, remote.address);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing udp address");
    const result = await pollGatewayTelemetry({
      gatewayHost: "127.0.0.1",
      gatewayPort: address.port,
      timeoutMs: 1000
    });
    assert.equal(result.seq, 11);
    assert.equal(result.temp_x10, 301);
  } finally {
    server.close();
  }
});

test("bridgeOnce uploads gateway telemetry into cloud ingest", async () => {
  const app = await createTestApp();
  const server = dgram.createSocket("udp4");
  const telemetry = { seq: 42, temp_x10: 253, humi_x10: 618, light_x10: 845, motion: 1, patrol: 0, err: 0 };

  await new Promise((resolve) => server.bind(0, "127.0.0.1", resolve));
  server.on("message", (_message, remote) => {
    server.send(Buffer.from(JSON.stringify(telemetry), "utf8"), remote.port, remote.address);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing udp address");

    const result = await bridgeOnce({
      gatewayHost: "127.0.0.1",
      gatewayPort: address.port,
      timeoutMs: 1000,
      cloudBaseUrl: app.baseUrl,
      baseStationId: "sle-base-001",
      deviceKey: app.deviceKey,
      deviceId: "ws63-car-001"
    });

    assert.equal(result.uploadStatus, 201);

    const token = await app.login();
    const readings = await fetch(`${app.baseUrl}/api/readings?deviceId=ws63-car-001&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await readings.json();
    assert.equal(body.readings[0].temperature, 25.3);
    assert.equal(body.readings[0].direction, "forward");
  } finally {
    server.close();
    await app.close();
  }
});

test("parseBridgeArgs reads flags and detects help", () => {
  const options = parseBridgeArgs([
    "--gateway-host", "127.0.0.1",
    "--gateway-port", "9999",
    "--device-key", "abc",
    "--once"
  ], {});

  assert.equal(options.gatewayHost, "127.0.0.1");
  assert.equal(options.gatewayPort, 9999);
  assert.equal(options.deviceKey, "abc");
  assert.equal(options.once, true);
  assert.equal(options.help, false);

  const helpOptions = parseBridgeArgs(["--help"], {});
  assert.equal(helpOptions.help, true);
});

test("validateBridgeOptions rejects missing device key", () => {
  assert.throws(() => validateBridgeOptions({
    gatewayHost: "192.168.6.1",
    gatewayPort: 8888,
    timeoutMs: 1500,
    intervalMs: 1000,
    cloudBaseUrl: "https://www.rxcccccc.icu/ws63-api",
    baseStationId: "sle-base-001",
    deviceId: "ws63-car-001",
    deviceKey: "",
    once: false,
    help: false
  }), /Missing device key/);
});

test("buildUsage includes the one-shot command", () => {
  const usage = buildUsage();
  assert.match(usage, /npm run bridge:cloud -- --once/);
  assert.match(usage, /DEVICE_INGEST_KEY/);
});
