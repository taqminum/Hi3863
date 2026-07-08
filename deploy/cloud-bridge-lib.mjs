import dgram from "node:dgram";

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

export function buildRawTelemetryPayload(rawTelemetry, options = {}) {
  assertObject(rawTelemetry, "rawTelemetry");
  const payload = {
    ...rawTelemetry,
    receivedAt: options.receivedAt ?? new Date().toISOString()
  };
  if (options.deviceId) {
    payload.deviceId = options.deviceId;
  }
  return payload;
}

export async function pollGatewayTelemetry(options) {
  const {
    gatewayHost,
    gatewayPort,
    timeoutMs = 1500,
    query = "GET"
  } = options;

  if (!gatewayHost) throw new Error("gatewayHost is required");
  if (!gatewayPort) throw new Error("gatewayPort is required");

  const socket = dgram.createSocket("udp4");

  try {
    const message = Buffer.from(query, "utf8");
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`UDP telemetry timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("error", (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });

      socket.once("message", (buffer) => {
        clearTimeout(timer);
        socket.close();
        resolve(buffer.toString("utf8"));
      });

      socket.send(message, gatewayPort, gatewayHost, (error) => {
        if (error) {
          clearTimeout(timer);
          socket.close();
          reject(error);
        }
      });
    });

    const telemetry = JSON.parse(response);
    assertObject(telemetry, "gateway telemetry");
    return telemetry;
  } finally {
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore double-close from timeout or message path
      }
    }
  }
}

export async function uploadTelemetry(options) {
  const {
    cloudBaseUrl,
    baseStationId,
    deviceKey,
    payload,
    fetchImpl = fetch
  } = options;

  if (!cloudBaseUrl) throw new Error("cloudBaseUrl is required");
  if (!baseStationId) throw new Error("baseStationId is required");
  if (!deviceKey) throw new Error("deviceKey is required");
  assertObject(payload, "payload");

  const response = await fetchImpl(
    `${cloudBaseUrl.replace(/\/$/, "")}/api/ingest/base-stations/${encodeURIComponent(baseStationId)}/telemetry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": deviceKey
      },
      body: JSON.stringify(payload)
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Cloud ingest failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return {
    status: response.status,
    body
  };
}

export async function bridgeOnce(options) {
  const rawTelemetry = await pollGatewayTelemetry(options);
  const payload = buildRawTelemetryPayload(rawTelemetry, {
    deviceId: options.deviceId,
    receivedAt: options.receivedAt
  });
  const uploaded = await uploadTelemetry({
    cloudBaseUrl: options.cloudBaseUrl,
    baseStationId: options.baseStationId,
    deviceKey: options.deviceKey,
    payload,
    fetchImpl: options.fetchImpl
  });

  return {
    rawTelemetry,
    payload,
    uploadStatus: uploaded.status,
    uploadBody: uploaded.body
  };
}
