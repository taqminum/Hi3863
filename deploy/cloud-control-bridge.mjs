#!/usr/bin/env node

import { bridgeControlOnce } from "./cloud-control-bridge-lib.mjs";
import {
  buildControlBridgeUsage,
  parseControlBridgeArgs,
  validateControlBridgeOptions
} from "./cloud-control-bridge-cli.mjs";

async function runLoop(options) {
  console.log(
    `[control-bridge] start gateway=${options.gatewayHost}:${options.gatewayPort} `
    + `cloud=${options.cloudBaseUrl} base=${options.baseStationId} `
    + `mode=${options.once ? "once" : `loop/${options.intervalMs}ms`}`
  );

  for (;;) {
    try {
      const result = await bridgeControlOnce(options);
      console.log(`[control-bridge] pulled=${result.commands.length} processed=${result.processed.length}`);
      for (const item of result.processed) {
        const status = item.ack?.command?.status ?? "unknown";
        console.log(`[control-bridge] ${item.command.id} -> ${status}`);
      }
    } catch (error) {
      console.error(`[control-bridge] ${error instanceof Error ? error.message : String(error)}`);
    }

    if (options.once) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

const options = parseControlBridgeArgs(process.argv.slice(2));
if (options.help) {
  console.log(buildControlBridgeUsage());
} else {
  validateControlBridgeOptions(options);
  await runLoop(options);
}
