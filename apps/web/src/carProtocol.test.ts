import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompatControlPayload,
  buildCloudControlBody,
  buildDrivePayload,
  joystickToDifferential,
  joystickToLegacyCommand,
  normalizeCarTelemetry
} from "./carProtocol.ts";

test("joystick maps to bounded differential wheel output", () => {
  assert.deepEqual(joystickToDifferential({ x: 0, y: 0 }, { maxPercent: 70 }), { left: 0, right: 0 });
  assert.deepEqual(joystickToDifferential({ x: 0, y: 1 }, { maxPercent: 70 }), { left: 70, right: 70 });
  assert.deepEqual(joystickToDifferential({ x: 0.5, y: 0.5 }, { maxPercent: 70 }), { left: 70, right: 0 });
  assert.deepEqual(joystickToDifferential({ x: -0.5, y: 0.5 }, { maxPercent: 70 }), { left: 0, right: 70 });
  assert.deepEqual(joystickToDifferential({ x: 1, y: 0 }, { maxPercent: 70 }), { left: 70, right: -70 });
});

test("joystick maps to current firmware compatible command", () => {
  assert.equal(joystickToLegacyCommand({ x: 0, y: 0 }), "stop");
  assert.equal(joystickToLegacyCommand({ x: 0, y: 0.8 }), "forward");
  assert.equal(joystickToLegacyCommand({ x: 0, y: -0.8 }), "backward");
  assert.equal(joystickToLegacyCommand({ x: -0.9, y: 0.1 }), "left");
  assert.equal(joystickToLegacyCommand({ x: 0.9, y: 0.1 }), "right");
});

test("builds current firmware compatible payload", () => {
  assert.deepEqual(buildCompatControlPayload("forward", 12, 900), { cmd: "forward", speed: 20, duration_ms: 900 });
  assert.deepEqual(buildCompatControlPayload("left", 80, 900), { cmd: "left", speed: 50, duration_ms: 900 });
  assert.deepEqual(buildCompatControlPayload("stop", 99, 900), { cmd: "stop", speed: 0, duration_ms: 0 });
  assert.deepEqual(buildCompatControlPayload("auto_start", 99, 900), { cmd: "auto_start" });
});

test("builds future drive payload", () => {
  assert.deepEqual(buildDrivePayload({ left: 72, right: -4 }, 900), { cmd: "drive", left: 72, right: -4, duration_ms: 900 });
});

test("builds cloud control body from differential wheels", () => {
  assert.deepEqual(buildCloudControlBody("ws63-car-001", "sle-base-001", { left: 72, right: -4 }, 350), {
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    action: "drive",
    speed: 0,
    left: 72,
    right: -4,
    durationMs: 350
  });
  assert.deepEqual(buildCloudControlBody("ws63-car-001", "sle-base-001", { left: 0, right: 0 }, 350), {
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    action: "stop",
    speed: 0,
    left: 0,
    right: 0,
    durationMs: 350
  });
});

test("normalizes car telemetry x10 fields", () => {
  assert.deepEqual(normalizeCarTelemetry({
    seq: 8,
    temp_x10: 286,
    humi_x10: 630,
    light_x10: 2466,
    temp_alert: 1,
    humi_alert: 0,
    light_alert: 1,
    motion: 3,
    patrol: 1,
    err: 0
  }, "2026-07-07T08:00:00.000Z"), {
    seq: 8,
    temperature: 28.6,
    humidity: 63,
    lightness: 246.6,
    alerts: ["temperature", "light"],
    motion: "left",
    patrol: true,
    err: 0,
    recordedAt: "2026-07-07T08:00:00.000Z"
  });
});
