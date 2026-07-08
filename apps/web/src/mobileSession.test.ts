import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultMobileConnectionMode,
  mobileSessionAllowsLocalControl,
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
