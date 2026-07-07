import {
  CAR_LOCAL_BASE_URL,
  type CompatControlPayload,
  type DrivePayload,
  normalizeCarTelemetry,
  type LocalTelemetrySample,
  type RawCarTelemetry
} from "./carProtocol";

export class LocalCarError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function localBaseUrl(): string {
  return localStorage.getItem("ws63-local-car-url")?.replace(/\/$/, "") || CAR_LOCAL_BASE_URL;
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

export const localCarApi = {
  async telemetry(): Promise<LocalTelemetrySample> {
    const response = await fetch(`${localBaseUrl()}/api/data`, { cache: "no-store" });
    const raw = await parseJsonResponse<RawCarTelemetry>(response);
    return normalizeCarTelemetry(raw);
  },

  async send(payload: CompatControlPayload | DrivePayload): Promise<unknown> {
    const response = await fetch(`${localBaseUrl()}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return parseJsonResponse<unknown>(response);
  }
};
