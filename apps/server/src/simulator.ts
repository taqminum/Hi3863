import { createCurrentAgentReport, ingestTelemetryBatch } from "./db.ts";
import type { BaseStationTelemetry } from "./domain.ts";
import { broadcast } from "./realtime.ts";

let timer: NodeJS.Timeout | null = null;
let tick = 0;

export function createSimulatorTelemetryPayload(sequence: number): BaseStationTelemetry {
  return {
    batchId: `sim-batch-${sequence}`,
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

export function startTelemetrySimulator(): void {
  if (process.env.SIMULATOR === "0" || timer) return;

  timer = setInterval(() => {
    tick += 1;
    const result = ingestTelemetryBatch(createSimulatorTelemetryPayload(tick));
    const report = createCurrentAgentReport("ws63-car-001");
    broadcast("telemetry", { readings: result.readings, report });
  }, Number(process.env.SIMULATOR_INTERVAL_MS ?? 3500));
}
