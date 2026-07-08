import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMobileConnectionMode, mobileSessionAllowsLocalControl, shouldPollLocalTelemetry } from "./mobile/mobileSession.ts";

test("mobile app defaults to local hardware mode for field integration", () => {
  assert.equal(defaultMobileConnectionMode(null), "local");
  assert.equal(defaultMobileConnectionMode("cloud"), "cloud");
});

test("local mobile control does not require a cloud token", () => {
  assert.equal(mobileSessionAllowsLocalControl("local", null), true);
  assert.equal(mobileSessionAllowsLocalControl("cloud", null), false);
  assert.equal(mobileSessionAllowsLocalControl("cloud", "token"), true);
});

test("local telemetry polling backs off immediately after control commands", () => {
  assert.equal(shouldPollLocalTelemetry(1_000, 0), true);
  assert.equal(shouldPollLocalTelemetry(1_000, 700), false);
  assert.equal(shouldPollLocalTelemetry(1_000, 200), true);
});
