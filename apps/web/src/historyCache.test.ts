import assert from "node:assert/strict";
import { test } from "node:test";
import { createReadingCache } from "./historyCache.ts";
import type { Reading } from "./api.ts";

function reading(id: string, recordedAt: string, temperature: number): Reading {
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
    recordedAt
  };
}

test("memory reading cache saves, deduplicates and loads readings by range", async () => {
  const cache = createReadingCache({ forceMemory: true });
  await cache.save("cloud", [
    reading("old", "2026-07-08T09:59:00.000Z", 20),
    reading("same", "2026-07-08T10:00:00.000Z", 25)
  ]);
  await cache.save("gateway", [
    reading("same", "2026-07-08T10:00:00.000Z", 26),
    reading("new", "2026-07-08T10:01:00.000Z", 27)
  ]);

  const loaded = await cache.load({
    deviceId: "ws63-car-001",
    from: "2026-07-08T10:00:00.000Z",
    to: "2026-07-08T10:02:00.000Z"
  });

  assert.deepEqual(loaded.map((item) => [item.id, item.temperature, item.source]), [
    ["same", 26, "gateway"],
    ["new", 27, "gateway"]
  ]);
});
