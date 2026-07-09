import assert from "node:assert/strict";
import { test } from "node:test";
import type { BaseStationRecord, DeviceRecord, PatrolTask, User } from "./api.ts";
import { buildMobilePatrolModel, mobilePatrolTaskDetail, mobilePatrolTimeline } from "./mobile/patrol/mobilePatrolModel.ts";

const user: User = { id: "user-admin", username: "admin", displayName: "绠＄悊鍛?", role: "admin" };
const device: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E 鐜宸℃灏忚溅 001",
  base_station_id: "sle-base-001",
  status: "online",
  connection_mode: "sle-gateway",
  direct_url: "",
  last_seen: "2026-07-09T08:00:00.000Z"
};
const base: BaseStationRecord = {
  id: "sle-base-001",
  name: "H3863 鏄熼棯鍩虹珯",
  status: "online",
  network_status: "online",
  last_heartbeat: "2026-07-09T08:00:00.000Z"
};

function task(status: PatrolTask["status"], overrides: Partial<PatrolTask> = {}): PatrolTask {
  return {
    id: `task-${status}`,
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "棰勬绾胯矾",
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
  assert.equal(mobilePatrolTaskDetail(task("running")), "鍓嶈繘 45% 2s -> 宸﹁浆 35% 0.6s -> 鍋滄 0.5s");
});

test("maps patrol lifecycle to the current four-row mobile timeline", () => {
  assert.deepEqual(mobilePatrolTimeline(task("pending")).map((item) => [item.title, item.state]), [
    ["浠诲姟宸插垱寤?", "done"],
    ["绛夊緟鍩虹珯鎷夊彇", "idle"],
    ["绛夊緟绾胯矾鎵ц", "idle"],
    ["绛夊緟瀹屾垚鍥炴墽", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("running")).map((item) => [item.title, item.state]), [
    ["浠诲姟宸插垱寤?", "done"],
    ["鍩虹珯宸叉媺鍙?", "done"],
    ["绾胯矾鎵ц涓?", "active"],
    ["绛夊緟瀹屾垚鍥炴墽", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("failed")).map((item) => [item.title, item.state]), [
    ["浠诲姟宸插垱寤?", "done"],
    ["鍩虹珯宸叉媺鍙?", "done"],
    ["绾胯矾鎵ц澶辫触", "error"],
    ["瀹屾垚鍥炴墽", "idle"]
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
  assert.equal(model.deviceName, "WS63E 鐜宸℃灏忚溅 001");
  assert.equal(model.baseStationName, "H3863 鏄熼棯鍩虹珯 鍦ㄧ嚎");
  assert.equal(model.primaryActionLabel, "涓€閿笅鍙戜换鍔?");
  assert.equal(model.cards[0].kind, "cloud");
  assert.equal(model.cards[0].statusLabel, "绛夊緟鎷夊彇");
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
    notice: "浜戞湇鍔″櫒鏆傛椂涓嶅彲杈?"
  });

  assert.equal(model.canCreate, false);
  assert.equal(model.disabledReason, "浜戞湇鍔″櫒鏈繛鎺?");
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
  assert.equal(model.primaryActionLabel, "鍚姩鏈湴宸℃");
  assert.equal(model.cards[0].kind, "local");
  assert.equal(model.cards[0].statusLabel, "鏈湴鎵ц涓?");
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
