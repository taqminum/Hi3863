import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "ws63-api-")), "test.sqlite");
process.env.DEVICE_INGEST_KEY = "test-device-key";
process.env.JWT_SECRET = "test-secret";

const [{ initDb }, { createAppServer }] = await Promise.all([import("../src/db.ts"), import("../src/http.ts")]);

initDb();

export async function createTestApp() {
  const server = createAppServer();
  const baseUrl = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing server address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  async function login(username = "admin", password = "admin123"): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { token: string };
    return body.token;
  }

  return {
    baseUrl,
    login,
    deviceKey: "test-device-key",
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
