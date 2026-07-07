import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers.ts";

test("admin can update base station metadata", async () => {
  const app = await createTestApp();
  try {
    const token = await app.login();
    const response = await fetch(`${app.baseUrl}/api/base-stations/sle-base-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "星闪基站实验台", firmwareVersion: "ws63-base-0.2.0", ipAddress: "192.168.1.20" })
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { baseStation: { name: string; firmware_version: string; ip_address: string } };
    assert.equal(body.baseStation.name, "星闪基站实验台");
    assert.equal(body.baseStation.firmware_version, "ws63-base-0.2.0");
    assert.equal(body.baseStation.ip_address, "192.168.1.20");
  } finally {
    await app.close();
  }
});

test("operator cannot force device offline but admin can", async () => {
  const app = await createTestApp();
  try {
    const operator = await app.login("operator", "operator123");
    const forbidden = await fetch(`${app.baseUrl}/api/devices/ws63-car-001/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${operator}` },
      body: JSON.stringify({ status: "offline", reason: "manual-test" })
    });
    assert.equal(forbidden.status, 403);

    const admin = await app.login();
    const allowed = await fetch(`${app.baseUrl}/api/devices/ws63-car-001/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ status: "offline", reason: "manual-test" })
    });
    assert.equal(allowed.status, 200);
    const body = await allowed.json() as { device: { status: string; offline_reason: string } };
    assert.equal(body.device.status, "offline");
    assert.equal(body.device.offline_reason, "manual-test");
  } finally {
    await app.close();
  }
});
