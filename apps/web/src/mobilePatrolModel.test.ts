import assert from "node:assert/strict";
import { test } from "node:test";
import type { BaseStationRecord, DeviceRecord, PatrolTask, User } from "./api.ts";
import { buildMobilePatrolModel, mobilePatrolTaskDetail, mobilePatrolTimeline } from "./mobile/patrol/mobilePatrolModel.ts";

const user: User = { id: "user-admin", username: "admin", displayName: "管理员", role: "admin" };
const device: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E 环境巡检小车 001",
  base_station_id: "sle-base-001",
  status: "online",
  connection_mode: "sle-gateway",
  direct_url: "",
  last_seen: "2026-07-09T08:00:00.000Z"
};
const base: BaseStationRecord = {
  id: "sle-base-001",
  name: "H3863 星闪基站",
  status: "online",
  network_status: "online",
  last_heartbeat: "2026-07-09T08:00:00.000Z"
};

function task(status: PatrolTask["status"], overrides: Partial<PatrolTask> = {}): PatrolTask {
  return {
    id: `task-${status}`,
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "预检线路",
    steps_json: JSON.stringify([
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]),
    status,
    created_by: "user-admin",
    created_at: "2026-07-09T08:00:00.000Z",
    started_at: status === "running" || status === "completed" ? "2026-07-09T08:00:03.000Z" : null,
    finished_at: status === "completed" ? "2026-07-09T08:00:09.000Z" : null,
    ...overrides
  };
}

test("formats real patrol route steps without fake progress", () => {
  assert.equal(mobilePatrolTaskDetail(task("running")), "前进 45% 2s -> 左转 35% 0.6s -> 停止 0.5s");
});

test("maps patrol lifecycle to the current four-row mobile timeline", () => {
  assert.deepEqual(mobilePatrolTimeline(task("pending")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["等待基站拉取", "idle"],
    ["等待线路执行", "idle"],
    ["等待完成回执", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("running")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["基站已拉取", "done"],
    ["线路执行中", "active"],
    ["等待完成回执", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("failed")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["基站已拉取", "done"],
    ["线路执行失败", "error"],
    ["完成回执", "idle"]
  ]);
});

test("builds enabled cloud model from real device base station and tasks", () => {
  const model = buildMobilePatrolModel({
    user,
    token: "token",
    connectionMode: "cloud",
    selectedDevice: device,
    baseStations: [base],
    tasks: [task("pending")],
    cloudApiOnline: true,
    notice: ""
  });

  assert.equal(model.canCreate, true);
  assert.equal(model.deviceName, "WS63E 环境巡检小车 001");
  assert.equal(model.baseStationName, "H3863 星闪基站 在线");
  assert.equal(model.primaryActionLabel, "一键下发任务");
  assert.equal(model.cards[0].kind, "cloud");
  assert.equal(model.cards[0].statusLabel, "等待拉取");
});

test("blocks cloud creation when cloud API is offline", () => {
  const model = buildMobilePatrolModel({
    user,
    token: "token",
    connectionMode: "cloud",
    selectedDevice: device,
    baseStations: [base],
    tasks: [],
    cloudApiOnline: false,
    notice: "云服务器暂时不可达"
  });

  assert.equal(model.canCreate, false);
  assert.equal(model.disabledReason, "云服务器未连接");
});

test("labels gateway mode as local execution rather than a cloud task", () => {
  const model = buildMobilePatrolModel({
    user,
    token: null,
    connectionMode: "gateway",
    selectedDevice: device,
    baseStations: [base],
    tasks: [task("running", { id: "local-task-1", created_by: "local-field-operator" })],
    cloudApiOnline: false,
    notice: ""
  });

  assert.equal(model.canCreate, true);
  assert.equal(model.primaryActionLabel, "启动本地巡检");
  assert.equal(model.cards[0].kind, "local");
  assert.equal(model.cards[0].statusLabel, "本地执行中");
});

test("labels non-cloud connection mode tasks as local without magic task markers", () => {
  const expectedLocalStatusLabel = buildMobilePatrolModel({
    user,
    token: null,
    connectionMode: "gateway",
    selectedDevice: device,
    baseStations: [base],
    tasks: [task("running", { id: "local-task-reference", created_by: "local-field-operator" })],
    cloudApiOnline: false,
    notice: ""
  }).cards[0].statusLabel;

  for (const connectionMode of ["gateway", "car-direct"] as const) {
    const model = buildMobilePatrolModel({
      user,
      token: null,
      connectionMode,
      selectedDevice: device,
      baseStations: [base],
      tasks: [task("running", { id: `task-${connectionMode}-ordinary`, created_by: "user-admin" })],
      cloudApiOnline: false,
      notice: ""
    });

    assert.equal(model.cards[0].kind, "local");
    assert.equal(model.cards[0].statusLabel, expectedLocalStatusLabel);
    assert.equal(model.timelineStatusLabel, expectedLocalStatusLabel);
  }
});
