# Cloud Telemetry Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the APK show cloud API connectivity separately from real-time telemetry freshness, and prevent production from broadcasting empty simulator telemetry.

**Architecture:** Treat cloud reachability and telemetry freshness as two independent states. The server simulator must be opt-in with `SIMULATOR=1`; the mobile UI should show `cloud API online` even when telemetry is stale, while separately reporting the age of the latest reading.

**Tech Stack:** Node.js ESM server, React/Vite/Capacitor mobile client, SQLite-backed API, Node test runner.

## Global Constraints

- Work on `codex/project-collaboration`.
- Do not push without explicit confirmation.
- Keep unrelated dirty mobile changes intact.
- Use `https://www.rxcccccc.icu/ws63-api` as the cloud API URL.
- Keep `.gitnexus/`, runtime data, APK build output, screenshots, and local artifacts uncommitted.

---

### Task 1: Server Simulator Startup

**Files:**
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/simulator.ts`
- Test: `apps/server/tests/simulator.test.ts`

**Interfaces:**
- Consumes: `getConfig().simulator: boolean`
- Produces: `startTelemetrySimulator(options?: { intervalMs?: number }): boolean`
- Produces: `stopTelemetrySimulator(): void`
- Produces: `isTelemetrySimulatorRunning(): boolean`

- [x] **Step 1: Extend simulator tests**

Add assertions that the simulator is stopped by default and can be started/stopped explicitly with a long interval.

- [x] **Step 2: Run focused server test**

Run: `npm run test --workspace apps/server -- simulator`
Expected: simulator tests pass.

- [x] **Step 3: Make simulator opt-in from index**

Call `startTelemetrySimulator()` only when `config.simulator` is true.

- [x] **Step 4: Run server tests**

Run: `npm run test --workspace apps/server`
Expected: all server tests pass.

### Task 2: Cloud API vs Telemetry Status

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/mobile/MobileConsoleApp.tsx`
- Modify: `apps/web/src/mobile/mobileOpenDesign.ts`
- Test: `apps/web/src/mobileOpenDesign.test.ts`

**Interfaces:**
- Produces: `api.health(): Promise<{ ok: boolean }>`
- Produces: snapshot fields `cloudApiStatus`, `telemetryStatus`, and `telemetryDetail`.

- [x] **Step 1: Add mobile snapshot tests**

Add tests for cloud API online with stale telemetry, fresh telemetry, and no telemetry.

- [x] **Step 2: Implement snapshot state split**

Compute cloud status from `cloudApiOnline`, and telemetry status from latest reading age.

- [x] **Step 3: Add health check API and mobile state**

Call `/api/health` from the mobile app in cloud mode and feed `cloudApiOnline` into the snapshot.

- [x] **Step 4: Run web tests**

Run: `npm run test --workspace apps/web`
Expected: all web tests pass.

### Task 3: Diagnostics Documentation

**Files:**
- Modify: `deploy/README.md`
- Modify: `docs/local_test_route.md`

**Interfaces:**
- Documents bridge env vars: `DEVICE_INGEST_KEY`, `WS63_CLOUD_BASE_URL`, `WS63_GATEWAY_HOST`
- Documents expected App state: cloud API connected, telemetry stale/live.

- [x] **Step 1: Add bridge diagnosis commands**

Document `npm run bridge:cloud -- --once`, `deploy/smoke.ps1`, and `curl /api/health`.

- [x] **Step 2: Explain UI status semantics**

Document that cloud API and telemetry freshness are separate.

### Task 4: Full Verification

**Files:**
- All modified files above.

- [x] **Step 1: Run software verification**

Run:
`npm run test --workspace apps/server`
`npm run build --workspace apps/server`
`npm run test --workspace apps/web`
`npm run build --workspace apps/web`
`npm run check:app-parity`

- [x] **Step 2: Run APK build**

Run: `npm run build:apk`
Expected: Gradle build succeeds.

- [x] **Step 3: Inspect git diff**

Ensure only planned files changed, aside from pre-existing dirty files.
