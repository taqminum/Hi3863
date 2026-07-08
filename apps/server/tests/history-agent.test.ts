import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";
import { analyzeHistoryReadings } from "../src/agent-service.ts";
import type { SensorReading } from "../src/domain.ts";

function sample(id: string, recordedAt: string, temperature: number, rssi = -50): SensorReading {
  return {
    id,
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature,
    humidity: 62,
    lightness: 600,
    gear: "M",
    direction: "stop",
    status: "idle",
    linkMode: "sle",
    rssi,
    cachedCount: 0,
    recordedAt
  };
}

test("readings endpoint filters by time range and returns chronological data", async () => {
  const app = await createTestApp();
  try {
    for (const payload of [
      { batchId: "hist-1", receivedAt: "2026-07-08T09:59:00.000Z", temp_x10: 240, humi_x10: 600, light_x10: 5000, seq: 900 },
      { batchId: "hist-2", receivedAt: "2026-07-08T10:00:00.000Z", temp_x10: 250, humi_x10: 610, light_x10: 5100, seq: 901 },
      { batchId: "hist-3", receivedAt: "2026-07-08T10:01:00.000Z", temp_x10: 260, humi_x10: 620, light_x10: 5200, seq: 902 },
      { batchId: "hist-4", receivedAt: "2026-07-08T10:03:00.000Z", temp_x10: 270, humi_x10: 630, light_x10: 5300, seq: 903 }
    ]) {
      const response = await fetch(`${app.baseUrl}/api/ingest/base-stations/sle-base-001/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Key": app.deviceKey },
        body: JSON.stringify(payload)
      });
      assert.ok(response.status === 201 || response.status === 200);
    }

    const token = await app.login();
    const response = await fetch(
      `${app.baseUrl}/api/readings?deviceId=ws63-car-001&from=2026-07-08T10%3A00%3A00.000Z&to=2026-07-08T10%3A02%3A00.000Z&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(response.status, 200);
    const body = await response.json() as { readings: Array<{ temperature: number; recordedAt: string }> };

    assert.deepEqual(body.readings.map((item) => item.temperature), [25, 26]);
    assert.deepEqual(body.readings.map((item) => item.recordedAt), [
      "2026-07-08T10:00:00.000Z",
      "2026-07-08T10:01:00.000Z"
    ]);
  } finally {
    await app.close();
  }
});

test("history agent uses OpenAI-compatible client output when supplied", async () => {
  const report = await analyzeHistoryReadings({
    deviceId: "ws63-car-001",
    range: { from: "2026-07-08T10:00:00.000Z", to: "2026-07-08T10:10:00.000Z" },
    readings: [sample("a", "2026-07-08T10:00:00.000Z", 25), sample("b", "2026-07-08T10:01:00.000Z", 31)],
    missingIntervals: [],
    source: "cloud",
    modelClient: async () => ({
      riskLevel: "medium",
      summary: "温度有上升趋势，建议继续观察。",
      suggestions: ["缩短巡检间隔"],
      evidence: [{ code: "temperature_trend", label: "温度趋势", value: "up" }]
    })
  });

  assert.equal(report.riskLevel, "medium");
  assert.match(report.summary, /温度/);
  assert.equal(report.evidence[0].code, "temperature_trend");
});

test("history agent falls back to deterministic rules when no model client is available", async () => {
  const report = await analyzeHistoryReadings({
    deviceId: "ws63-car-001",
    range: { from: "2026-07-08T10:00:00.000Z", to: "2026-07-08T10:10:00.000Z" },
    readings: [sample("a", "2026-07-08T10:00:00.000Z", 31, -80)],
    missingIntervals: [{ from: "2026-07-08T10:02:00.000Z", to: "2026-07-08T10:07:00.000Z", durationMs: 300_000 }],
    source: "gateway"
  });

  assert.equal(report.riskLevel, "high");
  assert.ok(report.evidence.some((item) => item.code === "data_gap"));
  assert.ok(report.evidence.some((item) => item.code === "rssi_weak"));
});

test("history agent endpoint analyzes uploaded app readings", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login("operator", "operator123");
    const response = await fetch(`${app.baseUrl}/api/agent/analyze-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: "ws63-car-001",
        range: {
          from: "2026-07-08T10:00:00.000Z",
          to: "2026-07-08T10:10:00.000Z"
        },
        source: "gateway",
        missingIntervals: [
          { from: "2026-07-08T10:02:00.000Z", to: "2026-07-08T10:07:00.000Z", durationMs: 300_000 }
        ],
        readings: [
          sample("mobile-a", "2026-07-08T10:00:00.000Z", 31, -80)
        ]
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json() as { report: { riskLevel: string; evidence: Array<{ code: string }> } };
    assert.equal(body.report.riskLevel, "high");
    assert.ok(body.report.evidence.some((item) => item.code === "data_gap"));
  } finally {
    await app.close();
  }
});
