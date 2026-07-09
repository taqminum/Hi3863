import test from "node:test";
import assert from "node:assert/strict";
import { CAR_LOCAL_BASE_URL } from "./carProtocol.ts";
import { getLocalCarUrl, setLocalCarUrl } from "./localCarApi.ts";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true
});

test.beforeEach(() => {
  storage.clear();
});

test("defaults local car API to the WS63E SoftAP HTTP endpoint", () => {
  assert.equal(CAR_LOCAL_BASE_URL, "http://192.168.5.1:8080");
  assert.equal(getLocalCarUrl(), "http://192.168.5.1:8080");
});

test("migrates the old BearPi gateway URL cache to the WS63E SoftAP URL", () => {
  localStorage.setItem("ws63-local-car-url", "http://192.168.6.1:8080");

  assert.equal(getLocalCarUrl(), "http://192.168.5.1:8080");
  assert.equal(localStorage.getItem("ws63-local-car-url"), "http://192.168.5.1:8080");
});

test("preserves an explicitly configured local car URL", () => {
  setLocalCarUrl("http://192.168.5.99:8080/");

  assert.equal(getLocalCarUrl(), "http://192.168.5.99:8080");
});
