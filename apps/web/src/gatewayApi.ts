import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Reading } from "./api";
import {
  buildUdpGatewayControlMessage,
  CAR_LOCAL_UDP_HOST,
  CAR_LOCAL_UDP_PORT,
  type CompatControlPayload,
  type DrivePayload,
  normalizeCarTelemetry,
  type LocalTelemetrySample,
  type RawCarTelemetry
} from "./carProtocol.ts";

export interface GatewayTelemetrySample extends LocalTelemetrySample {
  rssi?: number;
  cachedCount: number;
}

interface Ws63UdpPlugin {
  send(options: { host: string; port: number; message: string; timeoutMs?: number }): Promise<{ response?: string }>;
}

const ws63Udp = registerPlugin<Ws63UdpPlugin>("Ws63Udp");

interface RawGatewayTelemetry extends RawCarTelemetry {
  rssi?: number;
  cached_count?: number;
}

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface GatewayUdpRequest {
  host: string;
  port: number;
  message: string;
  timeoutMs: number;
  expectResponse: boolean;
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
  const rssi = Number(raw.rssi);
  return {
    ...sample,
    ...(Number.isFinite(rssi) ? { rssi } : {}),
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

export function buildGatewayControlRequest(payload: CompatControlPayload | DrivePayload): GatewayUdpRequest {
  return {
    host: CAR_LOCAL_UDP_HOST,
    port: CAR_LOCAL_UDP_PORT,
    message: buildUdpGatewayControlMessage(payload),
    timeoutMs: 0,
    expectResponse: false
  };
}

async function udpRequest(message: string, options: { timeoutMs?: number; expectResponse?: boolean } = {}): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new GatewayError("gateway_udp_requires_android_apk");
  }
  const response = await ws63Udp.send({
    host: CAR_LOCAL_UDP_HOST,
    port: CAR_LOCAL_UDP_PORT,
    message,
    timeoutMs: options.timeoutMs ?? 1200
  });
  if (options.expectResponse === false) return response.response ?? "";
  if (!response.response) throw new GatewayError("gateway_udp_timeout");
  return response.response;
}

export const gatewayApi = {
  async telemetry(): Promise<GatewayTelemetrySample> {
    return parseGatewayTelemetryResponse(await udpRequest("GET"));
  },

  async send(payload: CompatControlPayload | DrivePayload): Promise<GatewayTelemetrySample> {
    return parseGatewayTelemetryResponse(await udpRequest(buildUdpGatewayControlMessage(payload)));
  },

  async sendControl(payload: CompatControlPayload | DrivePayload): Promise<void> {
    const request = buildGatewayControlRequest(payload);
    await udpRequest(request.message, {
      timeoutMs: request.timeoutMs,
      expectResponse: request.expectResponse
    });
  }
};
