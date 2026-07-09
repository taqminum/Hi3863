import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DeviceRecord, PatrolTask, Reading, User } from "./api.ts";
import { buildMobileOpenDesignSnapshot, buildMobileOpenDesignSrcDoc } from "./mobile/mobileOpenDesign.ts";

test("injects mobile landscape patch without removing Open Design chart functions", () => {
  const html = "<html><head></head><body><script>window.openChartModal=function(){}; window.closeChartModal=function(){}</script></body></html>";
  const result = buildMobileOpenDesignSrcDoc(html);
  assert.match(result, /ws63-mobile-landscape-patch/);
  assert.match(result, /window\.openChartModal/);
  assert.match(result, /window\.closeChartModal/);
});

test("injects real interaction bridge for joystick repeat, task creation and charts", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /setInterval\(\(\) => repeatDrive\(false\), DRIVE_REPEAT_MS\)/);
  assert.match(result, /send\("create-patrol", \{ template \}\)/);
  assert.match(result, /updateChart\("ov-chart-temp", snapshot\.series\.temperature\)/);
  assert.match(result, /window\.Chart\.getChart/);
});

test("updates data tab metric values from live snapshot", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function setDataMetric\(cardClass, value\)/);
  assert.match(result, /setDataMetric\("m-temp", snapshot\.temperatureLabel\)/);
  assert.match(result, /setDataMetric\("m-humid", snapshot\.humidityLabel\)/);
  assert.match(result, /setDataMetric\("m-light", snapshot\.lightnessLabel\)/);
});

test("source Open Design tasks tab uses safe placeholders instead of fixed mock tasks", () => {
  const html = readFileSync(new URL("./open-design/ws63e-inspection-app-full-8.html", import.meta.url), "utf8");
  const tasksSection = html.slice(html.indexOf('id="view-tasks"'), html.indexOf('id="view-data"'));

  assert.match(tasksSection, /等待手机端同步任务/);
  assert.match(tasksSection, /闭合环线巡检/);
  assert.match(tasksSection, /折返通道巡检/);
  assert.match(tasksSection, /向固件下发所选路线命令/);
  assert.doesNotMatch(tasksSection, /Auto-Inspect-093|Auto-Inspect-094|Night-Patrol-01|ROVER-01|任务队列 \(3\)/);
  assert.doesNotMatch(tasksSection, /onclick="alert/);
});

test("bridge replaces mock patrol cards and timeline from live snapshot", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function updateTaskQueue\(snapshot\)/);
  assert.match(result, /queue\.innerHTML = snapshot\.taskCards\.map/);
  assert.match(result, /function updateTaskTimeline\(snapshot\)/);
  assert.match(result, /updateTaskQueue\(snapshot\)/);
  assert.match(result, /updateTaskTimeline\(snapshot\)/);
});

test("mobile landscape patch gives tasks tab a phone-friendly two-column layout", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /body\[data-active-view="view-tasks"\] #view-tasks \.tasks-layout/);
  assert.match(result, /grid-template-columns: minmax\(190px, 0\.72fr\) minmax\(0, 1fr\) !important/);
  assert.match(result, /#view-tasks \.task-panel:nth-child\(1\)/);
  assert.match(result, /#view-tasks \.task-panel:nth-child\(3\)/);
});

test("bridge suppresses Open Design inline patrol handlers before sending real patrol request", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /event\.stopImmediatePropagation\(\)/);
  assert.match(result, /getElementById\("ws63-patrol-template"\)/);
  assert.match(result, /send\("create-patrol", \{ template \}\)/);
});


test("rescales live charts so light values outside mock range remain visible", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function fitChartScale\(chart, values\)/);
  assert.match(result, /fitChartScale\(chart, values\)/);
});

test("opens detail chart modal with live snapshot scale instead of mock light range", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function openLiveChartModal\(key\)/);
  assert.match(result, /window\.openChartModal = openLiveChartModal/);
  assert.match(result, /fitChartScale\(window\.__ws63DetailedChart, values\)/);
  assert.match(result, /pointHitRadius: 18/);
  assert.match(result, /function setChartReadout\(titleNode, label, value, unit\)/);
});

test("injects info modal for connection and agent details", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><div class=\"cloud-status\"></div><div class=\"risk-card\"></div></body></html>");
  assert.match(result, /function showInfoModal\(title, bodyHtml\)/);
  assert.match(result, /function openConnectionDetail\(\)/);
  assert.match(result, /function openAgentDetail\(\)/);
  assert.match(result, /activeTransportDetail/);
  assert.match(result, /\.topology-card/);
  assert.match(result, /openConnectionDetail\(\)/);
});

test("injects connection mode controls for cloud gateway and car direct", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><div class=\"device-container\"></div></body></html>");
  assert.match(result, /ws63-mode-cloud/);
  assert.match(result, /ws63-mode-gateway/);
  assert.match(result, /ws63-mode-car-direct/);
  assert.match(result, /send\("connection-mode", \{ mode \}\)/);
  assert.match(result, /left: 50%/);
  assert.match(result, /grid-template-columns: repeat\(3, minmax\(48px, 1fr\)\)/);
  assert.match(result, /send\("connect-network"\)/);
});

test("right system actions are explicit circular buttons", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><div class=\"sys-status\"><button id=\"theme-toggle\"></button><i data-lucide=\"wifi\"></i></div></body></html>");
  assert.match(result, /ws63-wifi-action/);
  assert.match(result, /ws63-wifi-meta/);
  assert.match(result, /width: 36px !important/);
  assert.match(result, /send\("connect-network"\)/);
});

test("theme bridge toggles Open Design light theme class", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><button id=\"theme-toggle\"></button></body></html>");
  assert.match(result, /attachThemeBridge/);
  assert.match(result, /classList\.toggle\("light-theme"\)/);
});

test("bridge keeps chart null values as gaps", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /chart\.options\.spanGaps = false/);
  assert.match(result, /snapshot\.seriesLabels/);
});

test("bridge routes time range buttons to host instead of mock chart data", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><div id=\"data-time-toggles\"><button class=\"time-btn\" data-range=\"24H\"></button></div></body></html>");
  assert.match(result, /attachHistoryRangeBridge/);
  assert.match(result, /event\.stopImmediatePropagation\(\)/);
  assert.match(result, /send\("history-range", \{ range \}\)/);
});

test("injects touch isolation before Open Design scripts and routes joystick touches by role", () => {
  const html = "<html><head><script src=\"https://unpkg.com/lucide@latest\"></script></head><body></body></html>";
  const result = buildMobileOpenDesignSrcDoc(html);
  assert.ok(result.indexOf("ws63-mobile-touch-isolation") < result.indexOf("https://unpkg.com/lucide@latest"));
  assert.match(result, /activeTouchIds = \{ joystick: null, speed: null \}/);
  assert.match(result, /roleForWindowTouchListener/);
  assert.match(result, /window\.__ws63TouchIsolation\?\.pick\(event, "joystick"\)/);
});

test("locks control view scrolling through active view CSS", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /body\[data-active-view="view-control"\] \.content-area/);
  assert.match(result, /overflow: hidden !important/);
});

test("repeats joystick drive commands while the pointer is held", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /DRIVE_REPEAT_MS = 1000/);
  assert.match(result, /window\.setInterval\(\(\) => repeatDrive\(false\), DRIVE_REPEAT_MS\)/);
  assert.match(result, /stopDrive\(\)/);
});

test("joystick drive output is capped by the selected speed limit", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function quantizedSpeedLimit\(\)/);
  assert.match(result, /const speedPercent = readSpeedPercent\(\)/);
  assert.match(result, /if \(speedPercent < 50\) return 35/);
  assert.match(result, /if \(speedPercent < 80\) return 70/);
  assert.match(result, /const speedLimit = quantizedSpeedLimit\(\)/);
  assert.match(result, /Math\.round\(\(y \+ turn\) \* speedLimit\)/);
  assert.match(result, /Math\.round\(\(y - turn\) \* speedLimit\)/);
  assert.doesNotMatch(result, /\(y \+ turn\) \* 70/);
});

test("joystick speed reader converts Open Design m/s display to percent", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /function readSpeedPercent\(\)/);
  assert.match(result, /if \(speed <= 2\.5\) return Math\.max\(0, Math\.min\(100, Math\.round\(\(speed \/ 2\.0\) \* 100\)\)\)/);
});

test("keeps overview cards visible without scrolling on landscape phones", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /#view-overview\.active/);
  assert.match(result, /grid-template-rows: minmax\(108px, 0\.68fr\) auto !important/);
  assert.match(result, /body\[data-active-view="view-overview"\] \.content-area/);
  assert.match(result, /overflow: hidden !important/);
  assert.match(result, /#view-overview \.data-grid/);
  assert.match(result, /height: clamp\(148px, 29vh, 176px\) !important/);
  assert.match(result, /#view-overview \.ov-chart-container/);
  assert.match(result, /height: 68px !important/);
});

test("uses cloud server naming and plain humidity label in mobile Open Design source", () => {
  const result = buildMobileOpenDesignSrcDoc(`
    <html><body>
      <span class="node-label">云 API</span>
      <span class="ov-data-label">环境湿度 (预警)</span>
    </body></html>
  `);

  assert.match(result, /云服务器/);
  assert.match(result, /环境湿度/);
  assert.doesNotMatch(result, /云 API|云API|环境湿度 \(预警\)|环境湿度\(预测\)/);
});

test("reserves permanent right system area and moves speed value upward", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /--ws63-system-right-reserve: clamp\(72px, env\(safe-area-inset-right, 96px\), 128px\)/);
  assert.match(result, /width: calc\(100vw - var\(--ws63-system-right-reserve\)\) !important/);
  assert.match(result, /body\[data-active-view="view-control"\] \.speed-value-display/);
  assert.match(result, /transform: translateY\(-12px\)/);
});

test("builds readable fallback snapshot when telemetry is empty", () => {
  const user: User = { id: "u1", username: "admin", displayName: "管理员", role: "admin" };
  const selectedDevice: DeviceRecord = {
    id: "ws63-car-001",
    name: "WS63E-巡检车-01",
    base_station_id: "sle-base-001",
    status: "online",
    connection_mode: "sle",
    direct_url: "",
    last_seen: new Date(0).toISOString()
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    selectedDevice,
    devices: [selectedDevice],
    baseStations: [],
    readings: [],
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    notice: ""
  });

  assert.equal(snapshot.deviceName, "WS63E-巡检车-01");
  assert.equal(snapshot.historyRange, "1H");
  assert.equal(snapshot.temperatureLabel, "--°C");
  assert.equal(snapshot.series.temperature.length, 60);
  assert.equal(snapshot.detailSeries.second.temperature.length, 60);
  assert.equal(snapshot.detailSeries.minute.temperature.length, 60);
  assert.equal(snapshot.activeTransportStatus, "offline");
  assert.equal(snapshot.activeTransportLabel, "云服务器未连接");
});

test("uses cache for charts but not for disconnected realtime overview values", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const recordedAt = new Date(Date.now() - 30_000).toISOString();
  const cachedReading = {
    id: "cached",
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: 31,
    humidity: 60,
    lightness: 24,
    gear: "M",
    direction: "stop",
    status: "idle",
    linkMode: "sle",
    rssi: -45,
    cachedCount: 0,
    recordedAt
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "car-direct",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [cachedReading],
    realtimeReading: null,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    notice: "小车直连连接失败"
  });

  assert.equal(snapshot.rssiLabel, "-- dBm");
  assert.equal(snapshot.temperatureLabel, "--°C");
  assert.equal(snapshot.series.temperature.some((value) => value === 31), true);
});

test("marks gateway topology warning when local telemetry is delayed", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const delayedReading: Reading = {
    id: "gateway-delayed",
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: 27,
    humidity: 64,
    lightness: 500,
    gear: "D",
    direction: "forward",
    status: "patrolling",
    linkMode: "sle",
    rssi: -50,
    cachedCount: 0,
    recordedAt: new Date(Date.now() - 2 * 60_000).toISOString()
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "gateway",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [delayedReading],
    realtimeReading: delayedReading,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    notice: ""
  });

  assert.equal(snapshot.cloudServerStatus, "offline");
  assert.equal(snapshot.baseStationNodeStatus, "warning");
  assert.equal(snapshot.deviceNodeStatus, "warning");
  assert.equal(snapshot.activeTransportStatus, "warning");
});

test("marks car-direct topology offline when realtime polling has an error", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const liveReading: Reading = {
    id: "car-live-but-error",
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: 27,
    humidity: 64,
    lightness: 500,
    gear: "D",
    direction: "forward",
    status: "patrolling",
    linkMode: "wifi",
    rssi: -50,
    cachedCount: 0,
    recordedAt: new Date(Date.now() - 10_000).toISOString()
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "car-direct",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [liveReading],
    realtimeReading: liveReading,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    notice: "小车直连连接失败"
  });

  assert.equal(snapshot.baseStationNodeStatus, "offline");
  assert.equal(snapshot.deviceNodeStatus, "offline");
  assert.equal(snapshot.activeTransportStatus, "offline");
});

test("shows cloud server connected while base station and car are offline without fresh telemetry", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [],
    realtimeReading: null,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    cloudApiOnline: true,
    notice: ""
  });

  assert.equal(snapshot.cloudServerStatus, "online");
  assert.equal(snapshot.baseStationNodeStatus, "offline");
  assert.equal(snapshot.deviceNodeStatus, "offline");
  assert.equal(snapshot.activeTransportStatus, "online");
  assert.equal(snapshot.activeTransportLabel, "云服务器已连接");
  assert.equal(snapshot.telemetryStatus, "empty");
  assert.match(snapshot.telemetryDetail, /尚未收到实时遥测/);
  assert.match(snapshot.temperatureLabel, /^--/);
});

test("keeps cloud connected while stale telemetry is reported separately", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const staleReading: Reading = {
    id: "stale",
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: 29,
    humidity: 61,
    lightness: 500,
    gear: "D",
    direction: "forward",
    status: "patrolling",
    linkMode: "sle",
    rssi: -52,
    cachedCount: 0,
    recordedAt: new Date(Date.now() - 10 * 60_000).toISOString()
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [staleReading],
    realtimeReading: staleReading,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    cloudApiOnline: true,
    notice: ""
  });

  assert.equal(snapshot.cloudServerStatus, "online");
  assert.equal(snapshot.baseStationNodeStatus, "offline");
  assert.equal(snapshot.deviceNodeStatus, "offline");
  assert.equal(snapshot.activeTransportStatus, "online");
  assert.equal(snapshot.activeTransportLabel, "云服务器已连接");
  assert.equal(snapshot.telemetryStatus, "stale");
  assert.match(snapshot.telemetryDetail, /实时遥测延迟/);
  assert.match(snapshot.temperatureLabel, /^--/);
});

test("shows live telemetry when cloud reading is fresh", () => {
  const user: User = { id: "u1", username: "admin", displayName: "admin", role: "admin" };
  const liveReading: Reading = {
    id: "live",
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: 25.4,
    humidity: 62,
    lightness: 800,
    gear: "D",
    direction: "forward",
    status: "patrolling",
    linkMode: "sle",
    rssi: -45,
    cachedCount: 1,
    recordedAt: new Date(Date.now() - 20_000).toISOString()
  };
  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    devices: [],
    baseStations: [],
    readings: [liveReading],
    realtimeReading: liveReading,
    commands: [],
    tasks: [],
    reports: [],
    audits: [],
    cloudApiOnline: true,
    notice: ""
  });

  assert.equal(snapshot.cloudServerStatus, "online");
  assert.equal(snapshot.baseStationNodeStatus, "online");
  assert.equal(snapshot.deviceNodeStatus, "online");
  assert.equal(snapshot.telemetryStatus, "live");
  assert.equal(snapshot.telemetryDetail, "实时遥测正常");
  assert.equal(snapshot.rssiLabel, "-45 dBm");
  assert.equal(snapshot.temperatureLabel, "25.4°C");
});

test("snapshot exposes real patrol task cards and route steps for the mobile tasks tab", () => {
  const user: User = { id: "u1", username: "admin", displayName: "管理员", role: "admin" };
  const selectedDevice: DeviceRecord = {
    id: "ws63-car-001",
    name: "WS63E-巡检车-01",
    base_station_id: "sle-base-001",
    status: "online",
    connection_mode: "sle",
    direct_url: "",
    last_seen: new Date(0).toISOString()
  };
  const tasks: PatrolTask[] = [{
    id: "task-1",
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "验收预检线路",
    steps_json: JSON.stringify([
      { action: "forward", speed: 70, durationMs: 1200 },
      { action: "left", speed: 45, durationMs: 500 },
      { action: "stop", speed: 0, durationMs: 0 }
    ]),
    status: "running",
    created_by: "user-admin",
    created_at: "2026-07-08T12:00:00.000Z",
    started_at: "2026-07-08T12:00:03.000Z",
    finished_at: null
  }];

  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    selectedDevice,
    devices: [selectedDevice],
    baseStations: [],
    readings: [],
    commands: [],
    tasks,
    reports: [],
    audits: [],
    notice: ""
  });

  assert.deepEqual(snapshot.taskCards, [{
    id: "task-1",
    name: "验收预检线路",
    status: "running",
    statusLabel: "执行中",
    detail: "前进 70% 1.2s -> 左转 45% 0.5s -> 停顿",
    timeLabel: "20:00:03",
    baseStationId: "sle-base-001"
  }]);
  assert.equal(snapshot.taskStatus, "执行中");
  assert.deepEqual(snapshot.taskTimeline.map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["基站已拉取", "done"],
    ["巡检路线执行", "active"],
    ["完成回执", "idle"]
  ]);
});

test("snapshot shows cancelled patrol tasks clearly on the mobile timeline", () => {
  const user: User = { id: "u1", username: "admin", displayName: "管理员", role: "admin" };
  const selectedDevice: DeviceRecord = {
    id: "ws63-car-001",
    name: "WS63E-巡检车-01",
    base_station_id: "sle-base-001",
    status: "online",
    connection_mode: "sle",
    direct_url: "",
    last_seen: new Date(0).toISOString()
  };
  const task: PatrolTask = {
    id: "task-cancelled",
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "取消演示",
    steps_json: "[]",
    status: "cancelled",
    created_by: "user-admin",
    created_at: "2026-07-08T12:00:00.000Z",
    started_at: null,
    finished_at: null
  };

  const snapshot = buildMobileOpenDesignSnapshot({
    user,
    connectionMode: "cloud",
    historyRange: "1H",
    selectedDevice,
    devices: [selectedDevice],
    baseStations: [],
    readings: [],
    commands: [],
    tasks: [task],
    reports: [],
    audits: [],
    notice: ""
  });

  assert.equal(snapshot.taskStatus, "已取消");
  assert.deepEqual(snapshot.taskTimeline.map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["任务已取消", "error"],
    ["线路未继续执行", "idle"],
    ["完成回执", "idle"]
  ]);
});
