#!/usr/bin/env node

import { bridgePatrolOnce } from "./cloud-patrol-bridge-lib.mjs";
import {
  buildPatrolBridgeUsage,
  parsePatrolBridgeArgs,
  validatePatrolBridgeOptions
} from "./cloud-patrol-bridge-cli.mjs";

async function runLoop(options) {
  console.log(
    `[patrol-bridge] start gateway=${options.gatewayHost}:${options.gatewayPort} `
    + `cloud=${options.cloudBaseUrl} base=${options.baseStationId} `
    + `mode=${options.once ? "once" : `loop/${options.intervalMs}ms`}`
  );

  for (;;) {
    try {
      const result = await bridgePatrolOnce(options);
      console.log(`[patrol-bridge] pulled=${result.tasks.length} processed=${result.processed.length}`);
      for (const item of result.processed) {
        const status = item.completed?.task?.status ?? item.failed?.task?.status ?? "unknown";
        console.log(`[patrol-bridge] ${item.task.id} -> ${status}`);
      }
    } catch (error) {
      console.error(`[patrol-bridge] ${error instanceof Error ? error.message : String(error)}`);
    }

    if (options.once) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

const options = parsePatrolBridgeArgs(process.argv.slice(2));
if (options.help) {
  console.log(buildPatrolBridgeUsage());
} else {
  validatePatrolBridgeOptions(options);
  await runLoop(options);
}
