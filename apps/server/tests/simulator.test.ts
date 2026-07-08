import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulatorTelemetryPayload,
  isTelemetrySimulatorRunning,
  startTelemetrySimulator,
  stopTelemetrySimulator
} from "../src/simulator.ts";

test("simulator telemetry contains batch id, sequence, link and device data", () => {
  const payload = createSimulatorTelemetryPayload(12);
  assert.equal(payload.batchId, "sim-batch-12");
  assert.equal(payload.sequence, 12);
  assert.equal(payload.baseStationId, "sle-base-001");
  assert.equal(payload.devices[0].deviceId, "ws63-car-001");
  assert.equal(typeof payload.link?.rssi, "number");
});

test("simulator can be started and stopped explicitly", () => {
  stopTelemetrySimulator();
  assert.equal(isTelemetrySimulatorRunning(), false);

  assert.equal(startTelemetrySimulator({ intervalMs: 60_000 }), true);
  assert.equal(isTelemetrySimulatorRunning(), true);
  assert.equal(startTelemetrySimulator({ intervalMs: 60_000 }), false);

  stopTelemetrySimulator();
  assert.equal(isTelemetrySimulatorRunning(), false);
});

test("simulator runtime batch ids can be unique per process run", () => {
  const payload = createSimulatorTelemetryPayload(12, "run-a");
  assert.equal(payload.batchId, "sim-run-a-batch-12");
});
