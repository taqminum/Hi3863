import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.ts";

test("config exposes safe defaults for local development", () => {
  delete process.env.PORT;
  delete process.env.HOST;
  const config = getConfig();
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 8787);
  assert.equal(config.cloud.host, "101.132.21.134");
  assert.equal(config.cloud.domain, "rxcccccc.icu");
});

test("config rejects invalid port", () => {
  process.env.PORT = "not-a-number";
  assert.throws(() => getConfig(), /Invalid PORT/);
  delete process.env.PORT;
});
