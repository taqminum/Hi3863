import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionModeLabel, normalizeConnectionMode, transportLabel } from "./connectionModes.ts";

test("normalizeConnectionMode keeps three user selectable modes and migrates legacy local", () => {
  assert.equal(normalizeConnectionMode("cloud"), "cloud");
  assert.equal(normalizeConnectionMode("gateway"), "gateway");
  assert.equal(normalizeConnectionMode("car-direct"), "car-direct");
  assert.equal(normalizeConnectionMode("local"), "gateway");
  assert.equal(normalizeConnectionMode("unknown"), "cloud");
});

test("connection mode labels describe the selected transport", () => {
  assert.equal(connectionModeLabel("cloud"), "云服务器");
  assert.equal(connectionModeLabel("gateway"), "星闪基站 Wi-Fi");
  assert.equal(connectionModeLabel("car-direct"), "小车直连");
  assert.equal(transportLabel("gateway"), "UDP");
});
