import { getConfig } from "./config.ts";
import { initDb } from "./db.ts";
import { createAppServer } from "./http.ts";
import { startTelemetrySimulator } from "./simulator.ts";

const config = getConfig();

initDb();
startTelemetrySimulator();

createAppServer().listen(config.port, config.host, () => {
  console.log(`WS63 platform API listening on http://${config.host}:${config.port}`);
  console.log(`Cloud target: ${config.cloud.domain} (${config.cloud.host})`);
});
