import test from "node:test";
import assert from "node:assert/strict";
import { createAgentReport } from "../src/domain.ts";

test("agent report includes deterministic evidence for weak RSSI and cache", () => {
  const report = createAgentReport([
    {
      id: "r1",
      deviceId: "ws63-car-001",
      baseStationId: "sle-base-001",
      temperature: 31,
      humidity: 45,
      lightness: 700,
      gear: "D",
      direction: "forward",
      status: "moving",
      linkMode: "sle",
      rssi: -80,
      cachedCount: 3,
      recordedAt: "2026-07-06T10:00:00.000Z"
    }
  ]);
  assert.equal(report.riskLevel, "high");
  assert.deepEqual(report.evidence.map((item) => item.code), ["temperature_high", "rssi_weak", "cache_pending"]);
});
