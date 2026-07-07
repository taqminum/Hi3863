export interface RuntimeConfig {
  host: string;
  port: number;
  publicOrigin: string;
  dbPath: string;
  ingestKey: string;
  jwtSecret: string;
  simulator: boolean;
  cloud: {
    host: string;
    domain: string;
  };
}

export function getConfig(): RuntimeConfig {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port,
    publicOrigin: process.env.PUBLIC_ORIGIN ?? "*",
    dbPath: process.env.DB_PATH ?? "data/ws63-platform.sqlite",
    ingestKey: process.env.DEVICE_INGEST_KEY ?? "dev-base-station-key",
    jwtSecret: process.env.JWT_SECRET ?? "dev-ws63-change-before-cloud-deploy",
    simulator: process.env.SIMULATOR === "1",
    cloud: {
      host: process.env.CLOUD_HOST ?? "101.132.21.134",
      domain: process.env.CLOUD_DOMAIN ?? "rxcccccc.icu"
    }
  };
}
