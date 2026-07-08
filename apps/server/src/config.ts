export interface RuntimeConfig {
  host: string;
  port: number;
  publicOrigin: string;
  dbPath: string;
  ingestKey: string;
  jwtSecret: string;
  simulator: boolean;
  agent: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
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
    agent: {
      enabled: process.env.OPENAI_AGENT_ENABLED === "1",
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://aigw.saurlax.com/v1",
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    },
    cloud: {
      host: process.env.CLOUD_HOST ?? "101.132.21.134",
      domain: process.env.CLOUD_DOMAIN ?? "rxcccccc.icu"
    }
  };
}
