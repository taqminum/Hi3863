import {
  CAR_LOCAL_BASE_URL,
  CAR_LOCAL_UDP_HOST,
  CAR_LOCAL_UDP_PORT,
  buildUdpGatewayControlMessage,
  type CompatControlPayload,
  type DrivePayload,
  normalizeCarTelemetry,
  type LocalTelemetrySample,
  type RawCarTelemetry
} from "./carProtocol.ts";
import { registerPlugin } from "@capacitor/core";

interface Ws63UdpPlugin {
  send(options: { host: string; port: number; message: string; timeoutMs?: number }): Promise<{ response?: string }>;
}

const ws63Udp = registerPlugin<Ws63UdpPlugin>("Ws63Udp");

export class LocalCarError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const legacyLocalCarUrls = new Set(["http://192.168.6.1:8080"]);

function localBaseUrl(): string {
  const storedUrl = localStorage.getItem("ws63-local-car-url")?.replace(/\/$/, "");
  if (!storedUrl || legacyLocalCarUrls.has(storedUrl)) {
    localStorage.setItem("ws63-local-car-url", CAR_LOCAL_BASE_URL);
    return CAR_LOCAL_BASE_URL;
  }
  return storedUrl;
}

export function getLocalCarUrl(): string {
  return localBaseUrl();
}

export function setLocalCarUrl(url: string): void {
  localStorage.setItem("ws63-local-car-url", url.replace(/\/$/, ""));
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LocalCarError(data?.err ?? data?.error ?? `HTTP ${response.status}`, response.status);
  }
  return data as T;
}

function shouldUseUdpGateway(): boolean {
  return false;
}

async function sendUdp(message: string, timeoutMs = 1200): Promise<string | undefined> {
  const result = await ws63Udp.send({
    host: CAR_LOCAL_UDP_HOST,
    port: CAR_LOCAL_UDP_PORT,
    message,
    timeoutMs
  });
  return result.response;
}

export const localCarApi = {
  async telemetry(): Promise<LocalTelemetrySample> {
    if (shouldUseUdpGateway()) {
      const response = await sendUdp("GET", 1500);
      if (!response) throw new LocalCarError("UDP telemetry timeout");
      return normalizeCarTelemetry(JSON.parse(response) as RawCarTelemetry);
    }
    const response = await fetch(`${localBaseUrl()}/api/data`, { cache: "no-store" });
    const raw = await parseJsonResponse<RawCarTelemetry>(response);
    return normalizeCarTelemetry(raw);
  },

  async send(payload: CompatControlPayload | DrivePayload): Promise<unknown> {
    if (shouldUseUdpGateway()) {
      await sendUdp(buildUdpGatewayControlMessage(payload), 0);
      return { ok: true };
    }
    const response = await fetch(`${localBaseUrl()}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return parseJsonResponse<unknown>(response);
  }
};
