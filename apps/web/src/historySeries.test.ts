import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reading } from "./api.ts";
import {
  buildTimeSeries,
  detectMissingIntervals,
  mergeCachedReadings,
  sampleReadingsByInterval,
  summarizeReadingsForAgent,
  type CachedReading
} from "./historySeries.ts";

function reading(id: string, recordedAt: string, temperature: number): CachedReading {
  return {
    id,
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature,
    humidity: 60,
    lightness: 500,
    gear: "M",
    direction: "stop",
    status: "idle",
    linkMode: "sle",
    rssi: -50,
    cachedCount: 0,
    recordedAt,
    source: "cloud",
    cachedAt: "2026-07-08T10:00:00.000Z"
  };
}

test("buildTimeSeries keeps empty time buckets as null gaps", () => {
  const points = buildTimeSeries({
    readings: [
      reading("r1", "2026-07-08T10:00:05.000Z", 25),
      reading("r2", "2026-07-08T10:02:05.000Z", 29)
    ],
    field: "temperature",
    from: "2026-07-08T10:00:00.000Z",
    to: "2026-07-08T10:04:00.000Z",
    bucketMs: 60_000
  });

  assert.deepEqual(points.map((point) => point.value), [25, null, 29, null]);
  assert.deepEqual(points.map((point) => point.count), [1, 0, 1, 0]);
});

test("second granularity labels include hour minute and second", () => {
  const points = buildTimeSeries({
    readings: [reading("r1", "2026-07-08T10:00:05.000Z", 25)],
    field: "temperature",
    from: "2026-07-08T10:00:05.000Z",
    to: "2026-07-08T10:00:06.000Z",
    bucketMs: 1000,
    granularity: "second"
  });

  assert.match(points[0].label, /\d{2}:\d{2}:\d{2}/);
});

test("mergeCachedReadings deduplicates by reading id and prefers newer cache source", () => {
  const oldReading = reading("same", "2026-07-08T10:00:05.000Z", 25);
  const newerReading = { ...oldReading, temperature: 26, source: "gateway" as const, cachedAt: "2026-07-08T10:01:00.000Z" };

  const merged = mergeCachedReadings([oldReading], [newerReading]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].temperature, 26);
  assert.equal(merged[0].source, "gateway");
});

test("sampleReadingsByInterval keeps one reading per device every second", () => {
  const sampled = sampleReadingsByInterval([
    reading("r1", "2026-07-08T10:00:05.100Z", 25),
    reading("r2", "2026-07-08T10:00:05.900Z", 26),
    reading("r3", "2026-07-08T10:00:06.000Z", 27)
  ], 1000);

  assert.deepEqual(sampled.map((item) => item.id), ["r2", "r3"]);
});

test("detectMissingIntervals reports gaps between actual received readings", () => {
  const gaps = detectMissingIntervals(
    [
      reading("r1", "2026-07-08T10:00:00.000Z", 25),
      reading("r2", "2026-07-08T10:05:30.000Z", 26)
    ],
    120_000
  );

  assert.deepEqual(gaps, [
    {
      from: "2026-07-08T10:00:00.000Z",
      to: "2026-07-08T10:05:30.000Z",
      durationMs: 330_000
    }
  ]);
});

test("summarizeReadingsForAgent only uses readings from the selected time range", () => {
  const readings: Reading[] = [
    reading("before", "2026-07-08T09:59:00.000Z", 10),
    reading("inside-a", "2026-07-08T10:00:00.000Z", 20),
    reading("inside-b", "2026-07-08T10:01:00.000Z", 30),
    reading("after", "2026-07-08T10:02:01.000Z", 99)
  ];

  const summary = summarizeReadingsForAgent(readings, {
    from: "2026-07-08T10:00:00.000Z",
    to: "2026-07-08T10:02:00.000Z",
    maxPoints: 10
  });

  assert.equal(summary.points.length, 2);
  assert.equal(summary.stats.temperature.avg, 25);
  assert.equal(summary.range.from, "2026-07-08T10:00:00.000Z");
  assert.equal(summary.range.to, "2026-07-08T10:02:00.000Z");
});
