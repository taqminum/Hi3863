import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Reading } from "./api";
import {
  type CompatControlPayload,
  normalizeCarTelemetry,
  type LocalTelemetrySample,
  type RawCarTelemetry
} from "./carProtocol.ts";

export interface GatewayTelemetrySample extends LocalTelemetrySample {
  rssi: number;
  cachedCount: number;
}

interface UdpBridgePlugin {
  request(options: { host: string; port: number; message: string; timeoutMs?: number }): Promise<{ message: string }>;
}

const udpBridge = registerPlugin<UdpBridgePlugin>("UdpBridge");
const gatewayHost = "192.168.6.1";
const gatewayPort = 8888;

interface RawGatewayTelemetry extends RawCarTelemetry {
  rssi?: number;
  cached_count?: number;
}

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function rawFromText(text: string): RawGatewayTelemetry {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed as RawGatewayTelemetry : {};
  } catch {
    throw new GatewayError("invalid_gateway_telemetry");
  }
}

export function parseGatewayTelemetryResponse(text: string, recordedAt = new Date().toISOString()): GatewayTelemetrySample {
  const raw = rawFromText(text);
  const sample = normalizeCarTelemetry(raw, recordedAt);
  return {
    ...sample,
    rssi: Number(raw.rssi ?? -45),
    cachedCount: Number(raw.cached_count ?? 0)
  };
}

export function gatewayTelemetryToReading(sample: GatewayTelemetrySample): Reading {
  return {
    id: `gateway-ws63-car-001-${sample.seq}-${Date.parse(sample.recordedAt) || Date.now()}`,
    deviceId: "ws63-car-001",
    baseStationId: "sle-base-001",
    temperature: sample.temperature,
    humidity: sample.humidity,
    lightness: sample.lightness,
    gear: sample.patrol ? "AUTO" : "M",
    direction: sample.motion,
    status: sample.err === 0 ? (sample.motion === "stop" ? "idle" : "moving") : "fault",
    linkMode: "gateway-udp",
    rssi: sample.rssi,
    cachedCount: sample.cachedCount,
    recordedAt: sample.recordedAt
  };
}

async function udpRequest(message: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new GatewayError("gateway_udp_requires_android_apk");
  }
  const response = await udpBridge.request({
    host: gatewayHost,
    port: gatewayPort,
    message,
    timeoutMs: 1200
  });
  return response.message;
}

export const gatewayApi = {
  async telemetry(): Promise<GatewayTelemetrySample> {
    return parseGatewayTelemetryResponse(await udpRequest("GET"));
  },

  async send(payload: CompatControlPayload): Promise<GatewayTelemetrySample> {
    return parseGatewayTelemetryResponse(await udpRequest(JSON.stringify(payload)));
  }
};
