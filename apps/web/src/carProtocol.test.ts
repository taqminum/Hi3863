import test from "node:test";
import assert from "node:assert/strict";
import {
  CAR_LOCAL_BASE_URL,
  CAR_LOCAL_UDP_HOST,
  CAR_LOCAL_UDP_PORT,
  buildCompatControlPayload,
  buildUdpGatewayCommand,
  buildUdpGatewayControlMessage,
  buildCompatPayloadFromWheels,
  buildCloudControlBody,
  buildDrivePayload,
  joystickToDifferential,
  joystickToLegacyCommand,
  normalizeCarTelemetry,
  wheelOutputToLegacyCommand
} from "./carProtocol.ts";

test("uses BearPi gateway LAN as the default local car API", () => {
  assert.equal(CAR_LOCAL_BASE_URL, "http://192.168.6.1:8080");
});

test("uses BearPi UDP gateway as the default local transport", () => {
  assert.equal(CAR_LOCAL_UDP_HOST, "255.255.255.255");
  assert.equal(CAR_LOCAL_UDP_PORT, 8888);
});

test("maps drive payloads to legacy command when compatibility is needed", () => {
  assert.equal(buildUdpGatewayCommand({ cmd: "drive", left: 50, right: 50, duration_ms: 350 }), "forward");
  assert.equal(buildUdpGatewayCommand({ cmd: "drive", left: -50, right: -50, duration_ms: 350 }), "backward");
  assert.equal(buildUdpGatewayCommand({ cmd: "drive", left: -40, right: 40, duration_ms: 350 }), "left");
  assert.equal(buildUdpGatewayCommand({ cmd: "drive", left: 40, right: -40, duration_ms: 350 }), "right");
  assert.equal(buildUdpGatewayCommand({ cmd: "drive", left: 0, right: 0, duration_ms: 350 }), "stop");
  assert.equal(buildUdpGatewayCommand({ cmd: "stop", speed: 0, duration_ms: 0 }), "stop");
});

test("builds differential JSON commands for smooth BearPi UDP control", () => {
  assert.equal(
    buildUdpGatewayControlMessage({ cmd: "drive", left: 50, right: 50, duration_ms: 350 }),
    JSON.stringify({ cmd: "drive", left: 50, right: 50, duration_ms: 2200 })
  );
  assert.equal(
    buildUdpGatewayControlMessage({ cmd: "drive", left: 40, right: -40, duration_ms: 350 }),
    JSON.stringify({ cmd: "drive", left: 40, right: -40, duration_ms: 2200 })
  );
  assert.equal(
    buildUdpGatewayControlMessage({ cmd: "stop", speed: 0, duration_ms: 0 }),
    JSON.stringify({ cmd: "stop", speed: 0, duration_ms: 0 })
  );
});

test("joystick maps to bounded differential wheel output", () => {
  assert.deepEqual(joystickToDifferential({ x: 0, y: 0 }, { maxPercent: 70 }), { left: 0, right: 0 });
  assert.deepEqual(joystickToDifferential({ x: 0, y: 1 }, { maxPercent: 70 }), { left: 70, right: 70 });
  assert.deepEqual(joystickToDifferential({ x: 0.5, y: 0.5 }, { maxPercent: 70 }), { left: 0, right: 70 });
  assert.deepEqual(joystickToDifferential({ x: -0.5, y: 0.5 }, { maxPercent: 70 }), { left: 70, right: 0 });
  assert.deepEqual(joystickToDifferential({ x: -0.5, y: -0.5 }, { maxPercent: 70 }), { left: -70, right: 0 });
  assert.deepEqual(joystickToDifferential({ x: 0.5, y: -0.5 }, { maxPercent: 70 }), { left: 0, right: -70 });
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

test("downgrades wheel output to current firmware compatible payload", () => {
  assert.equal(wheelOutputToLegacyCommand({ left: 70, right: 70 }), "forward");
  assert.equal(wheelOutputToLegacyCommand({ left: -70, right: -70 }), "backward");
  assert.equal(wheelOutputToLegacyCommand({ left: 70, right: -20 }), "right");
  assert.equal(wheelOutputToLegacyCommand({ left: -20, right: 70 }), "left");
  assert.deepEqual(buildCompatPayloadFromWheels({ left: 70, right: -20 }, 350), {
    cmd: "right",
    speed: 50,
    duration_ms: 350
  });
});

test("builds differential drive payload", () => {
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
