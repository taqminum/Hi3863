import type { Reading } from "./api";

export type ReadingSource = "cloud" | "gateway" | "car-direct";

export type NumericReadingField = "temperature" | "humidity" | "lightness" | "rssi";

export interface CachedReading extends Reading {
  source: ReadingSource;
  cachedAt: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  value: number | null;
  count: number;
}

export interface MissingInterval {
  from: string;
  to: string;
  durationMs: number;
}

export interface AgentHistorySummary {
  range: {
    from: string;
    to: string;
  };
  points: Array<{
    recordedAt: string;
    temperature: number;
    humidity: number;
    lightness: number;
    rssi: number;
    source?: ReadingSource;
  }>;
  stats: Record<NumericReadingField, {
    min: number | null;
    max: number | null;
    avg: number | null;
  }>;
  missingIntervals: MissingInterval[];
  sources: ReadingSource[];
}

function timeValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function label(value: number): string {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function asCachedReadings(readings: Reading[], source: ReadingSource, cachedAt = new Date().toISOString()): CachedReading[] {
  return readings.map((reading) => ({ ...reading, source, cachedAt }));
}

export function mergeCachedReadings(...groups: CachedReading[][]): CachedReading[] {
  const byId = new Map<string, CachedReading>();
  for (const reading of groups.flat()) {
    const existing = byId.get(reading.id);
    if (!existing || timeValue(reading.cachedAt) >= timeValue(existing.cachedAt)) {
      byId.set(reading.id, reading);
    }
  }
  return [...byId.values()].sort((a, b) => timeValue(a.recordedAt) - timeValue(b.recordedAt));
}

export function filterReadingsByRange<T extends Reading>(readings: T[], from: string, to: string): T[] {
  const start = timeValue(from);
  const end = timeValue(to);
  return readings
    .filter((reading) => {
      const recordedAt = timeValue(reading.recordedAt);
      return recordedAt >= start && recordedAt < end;
    })
    .sort((a, b) => timeValue(a.recordedAt) - timeValue(b.recordedAt));
}

export function buildTimeSeries(input: {
  readings: Reading[];
  field: NumericReadingField;
  from: string;
  to: string;
  bucketMs: number;
}): TimeSeriesPoint[] {
  const start = timeValue(input.from);
  const end = timeValue(input.to);
  const bucketMs = Math.max(1, Math.round(input.bucketMs));
  const bucketCount = Math.max(0, Math.ceil((end - start) / bucketMs));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    timestamp: start + index * bucketMs,
    values: [] as number[]
  }));

  for (const reading of input.readings) {
    const recordedAt = timeValue(reading.recordedAt);
    if (recordedAt < start || recordedAt >= end) continue;
    const index = Math.floor((recordedAt - start) / bucketMs);
    const value = Number(reading[input.field]);
    if (buckets[index] && Number.isFinite(value)) {
      buckets[index].values.push(value);
    }
  }

  return buckets.map((bucket) => {
    const value = bucket.values.length > 0
      ? roundOne(bucket.values.reduce((sum, item) => sum + item, 0) / bucket.values.length)
      : null;
    return {
      timestamp: iso(bucket.timestamp),
      label: label(bucket.timestamp),
      value,
      count: bucket.values.length
    };
  });
}

export function detectMissingIntervals(readings: Reading[], maxGapMs: number): MissingInterval[] {
  const sorted = [...readings].sort((a, b) => timeValue(a.recordedAt) - timeValue(b.recordedAt));
  const gaps: MissingInterval[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = timeValue(sorted[index - 1].recordedAt);
    const current = timeValue(sorted[index].recordedAt);
    const durationMs = current - previous;
    if (durationMs > maxGapMs) {
      gaps.push({
        from: iso(previous),
        to: iso(current),
        durationMs
      });
    }
  }
  return gaps;
}

function stats(readings: Reading[], field: NumericReadingField): { min: number | null; max: number | null; avg: number | null } {
  const values = readings.map((reading) => Number(reading[field])).filter(Number.isFinite);
  if (values.length === 0) return { min: null, max: null, avg: null };
  return {
    min: roundOne(Math.min(...values)),
    max: roundOne(Math.max(...values)),
    avg: roundOne(values.reduce((sum, value) => sum + value, 0) / values.length)
  };
}

export function summarizeReadingsForAgent(readings: Reading[], input: {
  from: string;
  to: string;
  maxPoints: number;
}): AgentHistorySummary {
  const inRange = filterReadingsByRange(readings, input.from, input.to);
  const step = Math.max(1, Math.ceil(inRange.length / Math.max(1, input.maxPoints)));
  const points = inRange.filter((_, index) => index % step === 0).map((reading) => ({
    recordedAt: reading.recordedAt,
    temperature: reading.temperature,
    humidity: reading.humidity,
    lightness: reading.lightness,
    rssi: reading.rssi,
    source: (reading as Partial<CachedReading>).source
  }));
  const sources = Array.from(new Set(
    inRange.map((reading) => (reading as Partial<CachedReading>).source).filter(Boolean) as ReadingSource[]
  ));

  return {
    range: {
      from: input.from,
      to: input.to
    },
    points,
    stats: {
      temperature: stats(inRange, "temperature"),
      humidity: stats(inRange, "humidity"),
      lightness: stats(inRange, "lightness"),
      rssi: stats(inRange, "rssi")
    },
    missingIntervals: detectMissingIntervals(inRange, 120_000),
    sources
  };
}
