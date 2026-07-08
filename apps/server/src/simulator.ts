import { createCurrentAgentReport, ingestTelemetryBatch } from "./db.ts";
import type { BaseStationTelemetry } from "./domain.ts";
import { broadcast } from "./realtime.ts";

let timer: NodeJS.Timeout | null = null;
let tick = 0;
let runId = "";

export function createSimulatorTelemetryPayload(sequence: number, simulatorRunId = ""): BaseStationTelemetry {
  return {
    batchId: simulatorRunId ? `sim-${simulatorRunId}-batch-${sequence}` : `sim-batch-${sequence}`,
    sequence,
    baseStationId: "sle-base-001",
    receivedAt: new Date().toISOString(),
    link: {
      mode: "sle",
      rssi: -48 - (sequence % 12),
      cachedCount: sequence % 18 === 0 ? 2 : 0
    },
    devices: [
      {
        deviceId: "ws63-car-001",
        temperature: Number((25 + Math.sin(sequence / 4) * 4 + (sequence % 30 === 0 ? 4 : 0)).toFixed(1)),
        humidity: Number((58 + Math.cos(sequence / 5) * 12).toFixed(1)),
        lightness: Math.round(430 + Math.sin(sequence / 3) * 260),
        gear: sequence % 5 === 0 ? "P" : "D",
        direction: sequence % 5 === 0 ? "stop" : "forward",
        status: sequence % 5 === 0 ? "idle" : "patrolling"
      }
    ]
  };
}

export function isTelemetrySimulatorRunning(): boolean {
  return timer !== null;
}

export function startTelemetrySimulator(options: { intervalMs?: number } = {}): boolean {
  if (timer) return false;

  runId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const intervalMs = options.intervalMs ?? Number(process.env.SIMULATOR_INTERVAL_MS ?? 3500);

  timer = setInterval(() => {
    tick += 1;
    const result = ingestTelemetryBatch(createSimulatorTelemetryPayload(tick, runId));
    const report = createCurrentAgentReport("ws63-car-001");
    broadcast("telemetry", { readings: result.readings, report });
  }, intervalMs);
  timer.unref?.();
  return true;
}

export function stopTelemetrySimulator(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  tick = 0;
  runId = "";
}
