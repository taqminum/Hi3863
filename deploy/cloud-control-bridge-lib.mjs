import dgram from "node:dgram";

export async function pollPendingCommands(options) {
  const {
    cloudBaseUrl,
    baseStationId,
    deviceKey,
    fetchImpl = fetch
  } = options;

  if (!cloudBaseUrl) throw new Error("cloudBaseUrl is required");
  if (!baseStationId) throw new Error("baseStationId is required");
  if (!deviceKey) throw new Error("deviceKey is required");

  const response = await fetchImpl(
    `${cloudBaseUrl.replace(/\/$/, "")}/api/base-stations/${encodeURIComponent(baseStationId)}/commands/pending`,
    {
      headers: {
        "X-Device-Key": deviceKey
      }
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Pending command pull failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function sendGatewayCommand(options) {
  const {
    gatewayHost,
    gatewayPort,
    payload,
    timeoutMs = 1000
  } = options;

  if (!gatewayHost) throw new Error("gatewayHost is required");
  if (!gatewayPort) throw new Error("gatewayPort is required");
  if (!payload) throw new Error("payload is required");

  const socket = dgram.createSocket("udp4");
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`UDP send timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("error", (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });

      socket.send(Buffer.from(payload, "utf8"), gatewayPort, gatewayHost, (error) => {
        clearTimeout(timer);
        socket.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    return { ok: true };
  } finally {
    try {
      socket.close();
    } catch {
      // ignore double-close
    }
  }
}

export async function acknowledgeCommandResult(options) {
  const {
    cloudBaseUrl,
    commandId,
    deviceKey,
    status,
    errorMessage,
    fetchImpl = fetch
  } = options;

  if (!cloudBaseUrl) throw new Error("cloudBaseUrl is required");
  if (!commandId) throw new Error("commandId is required");
  if (!deviceKey) throw new Error("deviceKey is required");
  if (!status) throw new Error("status is required");

  const response = await fetchImpl(
    `${cloudBaseUrl.replace(/\/$/, "")}/api/commands/${encodeURIComponent(commandId)}/ack`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": deviceKey
      },
      body: JSON.stringify({
        status,
        errorMessage
      })
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Command ack failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function bridgeControlOnce(options) {
  const pending = await pollPendingCommands(options);
  const commands = Array.isArray(pending.commands) ? pending.commands : [];
  const processed = [];

  for (const command of commands) {
    try {
      await sendGatewayCommand({
        gatewayHost: options.gatewayHost,
        gatewayPort: options.gatewayPort,
        payload: command.payload,
        timeoutMs: options.timeoutMs
      });
      const ack = await acknowledgeCommandResult({
        cloudBaseUrl: options.cloudBaseUrl,
        commandId: command.id,
        deviceKey: options.deviceKey,
        status: "executed",
        fetchImpl: options.fetchImpl
      });
      processed.push({ command, ack });
    } catch (error) {
      const ack = await acknowledgeCommandResult({
        cloudBaseUrl: options.cloudBaseUrl,
        commandId: command.id,
        deviceKey: options.deviceKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        fetchImpl: options.fetchImpl
      });
      processed.push({ command, ack, error });
    }
  }

  return {
    commands,
    processed
  };
}
