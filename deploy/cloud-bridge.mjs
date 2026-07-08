#!/usr/bin/env node

import { bridgeOnce } from "./cloud-bridge-lib.mjs";
import { buildUsage, parseBridgeArgs, validateBridgeOptions } from "./cloud-bridge-cli.mjs";

async function runLoop(options) {
  console.log(
    `[cloud-bridge] start gateway=${options.gatewayHost}:${options.gatewayPort} `
    + `cloud=${options.cloudBaseUrl} base=${options.baseStationId} device=${options.deviceId} `
    + `mode=${options.once ? "once" : `loop/${options.intervalMs}ms`}`
  );

  for (;;) {
    try {
      const result = await bridgeOnce(options);
      const reading = result.uploadBody.readings?.[0];
      console.log(
        `[cloud-bridge] uploaded seq=${result.rawTelemetry.seq ?? "?"} temp=${reading?.temperature ?? "?"} `
        + `humi=${reading?.humidity ?? "?"} light=${reading?.lightness ?? "?"} status=${result.uploadStatus}`
      );
    } catch (error) {
      console.error(`[cloud-bridge] ${error instanceof Error ? error.message : String(error)}`);
    }

    if (options.once) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

const options = parseBridgeArgs(process.argv.slice(2));
if (options.help) {
  console.log(buildUsage());
} else {
  validateBridgeOptions(options);
  await runLoop(options);
}
