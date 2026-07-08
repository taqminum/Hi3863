import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLocalPatrolTask,
  defaultMobileConnectionMode,
  mobileSessionAllowsLocalControl,
  selectMobileReadings,
  shouldAutoFallbackGatewayToCarDirect,
  shouldPollLocalTelemetry
} from "./mobile/mobileSession.ts";

test("mobile app defaults to cloud and migrates legacy local mode to gateway", () => {
  assert.equal(defaultMobileConnectionMode(null), "cloud");
  assert.equal(defaultMobileConnectionMode("cloud"), "cloud");
  assert.equal(defaultMobileConnectionMode("local"), "gateway");
  assert.equal(defaultMobileConnectionMode("gateway"), "gateway");
  assert.equal(defaultMobileConnectionMode("car-direct"), "car-direct");
});

test("gateway and car direct control do not require a cloud token", () => {
  assert.equal(mobileSessionAllowsLocalControl("gateway", null), true);
  assert.equal(mobileSessionAllowsLocalControl("car-direct", null), true);
  assert.equal(mobileSessionAllowsLocalControl("cloud", null), false);
  assert.equal(mobileSessionAllowsLocalControl("cloud", "token"), true);
});

test("local telemetry polling backs off immediately after control commands", () => {
  assert.equal(shouldPollLocalTelemetry(1_000, 0), true);
  assert.equal(shouldPollLocalTelemetry(1_000, 700), false);
  assert.equal(shouldPollLocalTelemetry(1_000, 200), true);
});

test("gateway mode stays selected after transient telemetry failures", () => {
  assert.equal(shouldAutoFallbackGatewayToCarDirect(1), false);
  assert.equal(shouldAutoFallbackGatewayToCarDirect(3), false);
  assert.equal(shouldAutoFallbackGatewayToCarDirect(10), false);
});

test("cloud mode prefers fresh live readings over cached history", () => {
  const cached = [{ id: "old", recordedAt: "2026-07-08T10:00:00.000Z" }];
  const live = [{ id: "new", recordedAt: "2026-07-08T10:01:00.000Z" }];

  assert.deepEqual(selectMobileReadings("cloud", cached, live), live);
  assert.deepEqual(selectMobileReadings("gateway", cached, live), cached);
  assert.deepEqual(selectMobileReadings("car-direct", [], live), live);
});

test("builds a real local patrol task record for gateway and car direct mode", () => {
  const existing = [{
    id: "task-old",
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "旧任务",
    steps_json: "[]",
    status: "completed" as const,
    created_by: "local-field-operator",
    created_at: "2026-07-08T10:00:00.000Z",
    started_at: "2026-07-08T10:00:00.000Z",
    finished_at: "2026-07-08T10:00:05.000Z"
  }];

  const next = buildLocalPatrolTask({
    currentTasks: existing,
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    mode: "gateway",
    now: "2026-07-08T12:00:00.000Z"
  });

  assert.equal(next[0].status, "running");
  assert.equal(next[0].name, "基站预检线路");
  assert.equal(next[0].started_at, "2026-07-08T12:00:00.000Z");
  assert.match(next[0].steps_json, /right/);
  assert.equal(next[1].id, "task-old");
});

test("local patrol display route matches the firmware precheck route", () => {
  const [task] = buildLocalPatrolTask({
    currentTasks: [],
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    mode: "gateway",
    now: "2026-07-08T12:00:00.000Z"
  });

  assert.deepEqual(JSON.parse(task.steps_json), [
    { action: "forward", speed: 45, durationMs: 2000 },
    { action: "left", speed: 35, durationMs: 600 },
    { action: "forward", speed: 45, durationMs: 2000 },
    { action: "right", speed: 35, durationMs: 600 },
    { action: "forward", speed: 45, durationMs: 2000 },
    { action: "stop", speed: 0, durationMs: 500 }
  ]);
});
