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

test("locks control view scrolling through active view CSS", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /body\[data-active-view="view-control"\] \.content-area/);
  assert.match(result, /overflow: hidden !important/);
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
  assert.equal(snapshot.temperatureLabel, "--°C");
  assert.equal(snapshot.series.temperature.length, 24);
});
