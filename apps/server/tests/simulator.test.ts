import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatorTelemetryPayload } from "../src/simulator.ts";

test("simulator telemetry contains batch id, sequence, link and device data", () => {
  const payload = createSimulatorTelemetryPayload(12);
  assert.equal(payload.batchId, "sim-batch-12");
  assert.equal(payload.sequence, 12);
  assert.equal(payload.baseStationId, "sle-base-001");
  assert.equal(payload.devices[0].deviceId, "ws63-car-001");
  assert.equal(typeof payload.link?.rssi, "number");
});
