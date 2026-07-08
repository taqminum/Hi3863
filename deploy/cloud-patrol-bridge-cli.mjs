export function parsePatrolBridgeArgs(argv, env = process.env) {
  const options = {
    gatewayHost: env.WS63_GATEWAY_HOST ?? "192.168.6.1",
    gatewayPort: Number(env.WS63_GATEWAY_PORT ?? 8888),
    timeoutMs: Number(env.WS63_GATEWAY_TIMEOUT_MS ?? 1000),
    intervalMs: Number(env.WS63_PATROL_BRIDGE_INTERVAL_MS ?? 1000),
    stepDelayMs: Number(env.WS63_PATROL_STEP_DELAY_MS ?? 100),
    cloudBaseUrl: env.WS63_CLOUD_BASE_URL ?? "https://www.rxcccccc.icu/ws63-api",
    baseStationId: env.WS63_BASE_STATION_ID ?? "sle-base-001",
    deviceKey: env.DEVICE_INGEST_KEY ?? "",
    once: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    const next = argv[index + 1];

    if (part === "--help" || part === "-h") {
      options.help = true;
      continue;
    }
    if (part === "--once") {
      options.once = true;
      continue;
    }
    if (part === "--gateway-host") options.gatewayHost = next;
    if (part === "--gateway-port") options.gatewayPort = Number(next);
    if (part === "--timeout-ms") options.timeoutMs = Number(next);
    if (part === "--interval-ms") options.intervalMs = Number(next);
    if (part === "--step-delay-ms") options.stepDelayMs = Number(next);
    if (part === "--cloud-base-url") options.cloudBaseUrl = next;
    if (part === "--base-station-id") options.baseStationId = next;
    if (part === "--device-key") options.deviceKey = next;

    if (part.startsWith("--") && part !== "--once" && part !== "--help") {
      index += 1;
    }
  }

  return options;
}

export function validatePatrolBridgeOptions(options) {
  if (!options.deviceKey) {
    throw new Error("Missing device key. Set DEVICE_INGEST_KEY or pass --device-key.");
  }
  if (!options.gatewayHost) {
    throw new Error("Missing gateway host.");
  }
  if (!Number.isFinite(options.gatewayPort) || options.gatewayPort <= 0) {
    throw new Error("gatewayPort must be a positive number.");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number.");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive number.");
  }
  if (!Number.isFinite(options.stepDelayMs) || options.stepDelayMs < 0) {
    throw new Error("stepDelayMs must be a non-negative number.");
  }
}

export function buildPatrolBridgeUsage() {
  return [
    "WS63 patrol task cloud bridge",
    "",
    "One-shot verification:",
    "  npm run bridge:patrol -- --once",
    "",
    "Continuous pull + execute + status update:",
    "  npm run bridge:patrol",
    "",
    "Required:",
    "  DEVICE_INGEST_KEY=<cloud ingest key>",
    "",
    "Flags:",
    "  --gateway-host <host>",
    "  --gateway-port <port>",
    "  --timeout-ms <ms>",
    "  --interval-ms <ms>",
    "  --step-delay-ms <ms>",
    "  --cloud-base-url <url>",
    "  --base-station-id <id>",
    "  --device-key <key>",
    "  --once",
    "  --help"
  ].join("\n");
}
