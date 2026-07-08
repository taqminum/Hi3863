import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGatewayControlRequest, gatewayTelemetryToReading, parseGatewayTelemetryResponse } from "./gatewayApi.ts";

test("parseGatewayTelemetryResponse accepts raw car telemetry JSON from BearPi UDP", () => {
  const sample = parseGatewayTelemetryResponse(JSON.stringify({
    seq: 7,
    temp_x10: 281,
    humi_x10: 610,
    light_x10: 1200,
    motion: 1,
    patrol: 0,
    err: 0,
    rssi: -62,
    cached_count: 3
  }), "2026-07-08T10:00:00.000Z");

  assert.equal(sample.temperature, 28.1);
  assert.equal(sample.motion, "forward");
  assert.equal(sample.rssi, -62);
  assert.equal(sample.cachedCount, 3);
});

test("gatewayTelemetryToReading marks source as sle gateway udp", () => {
  const reading = gatewayTelemetryToReading({
    seq: 7,
    temperature: 28.1,
    humidity: 61,
    lightness: 120,
    alerts: [],
    motion: "forward",
    patrol: false,
    err: 0,
    recordedAt: "2026-07-08T10:00:00.000Z",
    rssi: -62,
    cachedCount: 3
  });

  assert.equal(reading.baseStationId, "sle-base-001");
  assert.equal(reading.linkMode, "gateway-udp");
  assert.equal(reading.rssi, -62);
  assert.equal(reading.cachedCount, 3);
});

test("buildGatewayControlRequest sends controls without waiting for telemetry", () => {
  const request = buildGatewayControlRequest({ cmd: "drive", left: 70, right: 0, duration_ms: 350 });

  assert.equal(request.host, "255.255.255.255");
  assert.equal(request.port, 8888);
  assert.equal(request.timeoutMs, 0);
  assert.equal(request.expectResponse, false);
  assert.match(request.message, /"cmd":"drive"/);
});
