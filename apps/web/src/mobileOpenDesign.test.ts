import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeviceRecord, User } from "./api.ts";
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
  assert.match(result, /send\("create-patrol", \{ template: "standard" \}\)/);
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
});

test("injects connection mode controls for cloud gateway and car direct", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body><div class=\"device-container\"></div></body></html>");
  assert.match(result, /ws63-mode-cloud/);
  assert.match(result, /ws63-mode-gateway/);
  assert.match(result, /ws63-mode-car-direct/);
  assert.match(result, /send\("connection-mode", \{ mode \}\)/);
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

test("stretches overview content to avoid empty lower screen on landscape phones", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /#view-overview\.active/);
  assert.match(result, /grid-template-rows: minmax\(108px, 0\.72fr\) minmax\(260px, 1\.35fr\) !important/);
  assert.match(result, /#view-overview \.data-grid/);
  assert.match(result, /height: auto !important/);
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
  assert.equal(snapshot.series.temperature.length, 24);
});
