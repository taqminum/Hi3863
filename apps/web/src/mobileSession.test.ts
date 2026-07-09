import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLocalPatrolTask,
  closedLoopPatrolSteps,
  defaultMobileConnectionMode,
  firmwarePrecheckSteps,
  mobileSessionAllowsLocalControl,
  patrolTemplateDurationMs,
  reconcileLocalPatrolTasks,
  returnLanePatrolSteps,
  selectMobilePatrolTemplate,
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
  assert.equal(next[0].name, "基站方形闭环巡检");
  assert.equal(next[0].started_at, "2026-07-08T12:00:00.000Z");
  assert.match(next[0].steps_json, /closed-loop|left|forward/);
  assert.equal(next[1].id, "task-old");
});

test("local patrol tasks complete after the selected route duration", () => {
  const [task] = buildLocalPatrolTask({
    currentTasks: [],
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    mode: "gateway",
    templateId: "return-lane",
    now: "2026-07-08T12:00:00.000Z"
  });
  const durationMs = patrolTemplateDurationMs(selectMobilePatrolTemplate("return-lane"));

  const stillRunning = reconcileLocalPatrolTasks([task], Date.parse(task.created_at) + durationMs);
  assert.equal(stillRunning[0].status, "running");

  const completed = reconcileLocalPatrolTasks([task], Date.parse(task.created_at) + durationMs + 700);
  assert.equal(completed[0].status, "completed");
  assert.equal(completed[0].finished_at, "2026-07-08T12:00:07.900Z");
});

test("local patrol display route uses a square-corner closed-loop inspection route", () => {
  const [task] = buildLocalPatrolTask({
    currentTasks: [],
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    mode: "gateway",
    now: "2026-07-08T12:00:00.000Z"
  });

  const expectedClosedLoopRoute = [
    { action: "forward", speed: 45, durationMs: 1900 },
    { action: "stop", speed: 0, durationMs: 220 },
    { action: "left", speed: 46, durationMs: 420 },
    { action: "left", speed: 30, durationMs: 180 },
    { action: "forward", speed: 45, durationMs: 1900 },
    { action: "stop", speed: 0, durationMs: 220 },
    { action: "left", speed: 46, durationMs: 420 },
    { action: "left", speed: 30, durationMs: 180 },
    { action: "forward", speed: 45, durationMs: 1900 },
    { action: "stop", speed: 0, durationMs: 220 },
    { action: "left", speed: 46, durationMs: 420 },
    { action: "left", speed: 30, durationMs: 180 },
    { action: "forward", speed: 45, durationMs: 1900 },
    { action: "stop", speed: 0, durationMs: 220 },
    { action: "left", speed: 46, durationMs: 420 },
    { action: "left", speed: 30, durationMs: 180 },
    { action: "stop", speed: 0, durationMs: 500 }
  ];

  assert.deepEqual(JSON.parse(task.steps_json), expectedClosedLoopRoute);
  assert.deepEqual(firmwarePrecheckSteps, expectedClosedLoopRoute);
  assert.deepEqual(closedLoopPatrolSteps, expectedClosedLoopRoute);
});

test("mobile patrol templates provide two distinct effective routes", () => {
  assert.equal(selectMobilePatrolTemplate("closed-loop").name, "方形闭环巡检");
  assert.equal(selectMobilePatrolTemplate("return-lane").name, "方角折返巡检");
  assert.notDeepEqual(closedLoopPatrolSteps, returnLanePatrolSteps);
  assert.deepEqual(returnLanePatrolSteps, [
    { action: "forward", speed: 42, durationMs: 2100 },
    { action: "stop", speed: 0, durationMs: 260 },
    { action: "right", speed: 40, durationMs: 420 },
    { action: "right", speed: 26, durationMs: 140 },
    { action: "forward", speed: 38, durationMs: 1500 },
    { action: "stop", speed: 0, durationMs: 220 },
    { action: "left", speed: 40, durationMs: 420 },
    { action: "left", speed: 26, durationMs: 140 },
    { action: "backward", speed: 35, durationMs: 2200 },
    { action: "stop", speed: 0, durationMs: 500 }
  ]);
});
