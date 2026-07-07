import test from "node:test";
import assert from "node:assert/strict";
import {
  canPerform,
  createAgentReport,
  normalizeTelemetry,
  parsePatrolSteps,
  toCarControlPayload
} from "../src/domain.ts";

test("viewer cannot send control commands", () => {
  assert.equal(canPerform("viewer", "command:create"), false);
  assert.equal(canPerform("operator", "command:create"), true);
  assert.equal(canPerform("admin", "device:update"), true);
});

test("normalizes base station telemetry into one reading per sensor packet", () => {
  const readings = normalizeTelemetry({
    baseStationId: "sle-base-001",
    receivedAt: "2026-07-04T01:00:00.000Z",
    link: { rssi: -42, cachedCount: 2, mode: "sle" },
    devices: [
      {
        deviceId: "ws63-car-001",
        temperature: 29.4,
        humidity: 63.2,
        lightness: 512,
        gear: "D",
        direction: "forward",
        status: "moving"
      }
    ]
  });

  assert.equal(readings.length, 1);
  assert.equal(readings[0].deviceId, "ws63-car-001");
  assert.equal(readings[0].baseStationId, "sle-base-001");
  assert.equal(readings[0].temperature, 29.4);
  assert.equal(readings[0].linkMode, "sle");
  assert.equal(readings[0].cachedCount, 2);
});

test("maps web control commands to current car HTTP payloads", () => {
  assert.equal(toCarControlPayload({ action: "forward", speed: 60 }), "FORWARD:60");
  assert.equal(toCarControlPayload({ action: "backward", speed: 20 }), "BACKWARD:20");
  assert.equal(toCarControlPayload({ action: "stop", speed: 90 }), "STOP:0");
});

test("parses patrol steps with bounded speed and duration", () => {
  const steps = parsePatrolSteps([
    { action: "forward", speed: 120, durationMs: 90000 },
    { action: "stop", speed: 0, durationMs: 1000 }
  ]);

  assert.deepEqual(steps, [
    { action: "forward", speed: 100, durationMs: 60000 },
    { action: "stop", speed: 0, durationMs: 1000 }
  ]);
});

test("agent report flags hot and weak-link conditions", () => {
  const report = createAgentReport([
    {
      id: "reading-1",
      deviceId: "ws63-car-001",
      baseStationId: "sle-base-001",
      temperature: 31.2,
      humidity: 35,
      lightness: 1200,
      gear: "P",
      direction: "forward",
      status: "idle",
      linkMode: "sle",
      rssi: -81,
      cachedCount: 5,
      recordedAt: "2026-07-04T01:00:00.000Z"
    }
  ]);

  assert.equal(report.riskLevel, "high");
  assert.match(report.summary, /温度偏高/);
  assert.match(report.summary, /星闪链路偏弱/);
  assert.equal(report.evidence.some((item) => item.code === "rssi_weak"), true);
});
