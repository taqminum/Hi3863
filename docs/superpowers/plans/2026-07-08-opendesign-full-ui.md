# Open Design Full UI Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `apps/web` UI with the Open Design primary prototype while preserving and completing the real Web/APK business functions.

**Architecture:** Open Design owns the visual shell and the five primary screens: overview, control, tasks, data, and manage. Existing TypeScript API, auth, SSE, local car protocol, joystick differential drive, permissions, and APK packaging stay as the business layer. Former standalone Agent/Audit/Debug pages are folded into the Open Design data/manage screens.

**Tech Stack:** React 19, TypeScript, Vite, Capacitor Android, lucide-react, local SVG/canvas charts, Node API, SQLite.

## Global Constraints

- Work only on the software-side Web/APK and related validation scripts unless needed for docs.
- Do not touch firmware source under `src/` or vendor SDK/product code for this UI migration.
- Keep Web and APK using one React implementation; no separate mobile UI fork.
- Use Open Design file `ws63e-inspection-app-full-8.html` as the visual source of truth.
- Do not iframe the Open Design HTML; migrate it into real React components.
- Preserve real API behavior: auth, dashboard, SSE, commands, patrol tasks, devices, audit logs, Agent reports, local SoftAP fallback.
- Keep package id `icu.rxcccccc.ws63patrol` and APK cloud API `https://www.rxcccccc.icu/ws63-api`.

---

### Task 1: Safety And Plan Setup

**Files:**
- Create: `docs/superpowers/plans/2026-07-08-opendesign-full-ui.md`

**Interfaces:**
- Consumes: clean git working tree at commit `6bea9a2f`.
- Produces: rollback branch `backup/pre-opendesign-full-ui`.

- [x] **Step 1: Create rollback branch**

Run:

```powershell
git branch backup/pre-opendesign-full-ui
```

Expected: branch exists and points to the pre-migration commit.

- [x] **Step 2: Save this plan**

Run:

```powershell
git status --short
```

Expected: only this plan file is new before implementation begins.

### Task 2: Open Design Shell And Navigation

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Shell.tsx`
- Modify: `apps/web/src/views/index.ts`

**Interfaces:**
- Produces: `Tab = "overview" | "control" | "tasks" | "data" | "manage"`.
- Produces: a shell with `.device-container`, `.main-wrapper`, `.top-bar`, `.content-area`, `.side-nav`, and `.nav-item`.

- [ ] **Step 1: Replace old 8-tab shell with Open Design 5-screen shell**

Keep login and data state in `App.tsx`, but render only these screens:

```ts
export type Tab = "overview" | "control" | "tasks" | "data" | "manage";
```

Expected nav labels: `总览`, `遥控`, `巡检`, `数据`, `管理`.

- [ ] **Step 2: Keep role filtering inside screen content**

Do not hide `管理` from non-admin users; instead show read-only or denied states inside management panels.

### Task 3: Open Design Data Model Adapter

**Files:**
- Create: `apps/web/src/viewModels.ts`
- Modify: `apps/web/src/utils.ts`

**Interfaces:**
- Produces: `buildDashboardViewModel(input): DashboardViewModel`.
- Consumes: `Reading[]`, `DeviceRecord[]`, `BaseStationRecord[]`, `ControlCommand[]`, `PatrolTask[]`, `AgentReport[]`, `AuditLog[]`, `User`, `ConnectionMode`.

- [ ] **Step 1: Create derived UI values**

Expose latest temperature, humidity, light, RSSI, cache count, risk state, device/base online states, recent command, recent task, and chart series.

- [ ] **Step 2: Normalize empty states**

When data is missing, return Open Design-compatible fallback values such as `--`, `等待数据`, and empty chart arrays.

### Task 4: Overview Screen

**Files:**
- Modify: `apps/web/src/views/Overview.tsx`
- Modify: `apps/web/src/components/Primitives.tsx`

**Interfaces:**
- Consumes: `DashboardViewModel`.
- Produces: topology row, risk card, four metric cards, and chart modal trigger handlers.

- [ ] **Step 1: Port Open Design topology and risk card**

Render App -> Cloud API -> H3863 Base Station -> Car Node using lucide icons and real online/offline state.

- [ ] **Step 2: Port four overview data cards**

Cards must display SLE RSSI, temperature, humidity, and light. Clicking each card opens the detailed chart modal.

### Task 5: Control Screen

**Files:**
- Modify: `apps/web/src/views/Control.tsx`

**Interfaces:**
- Consumes: existing `carProtocol.ts` functions.
- Produces: Open Design joystick panel, center camera/HUD panel, command log, vertical speed slider, STOP control.

- [ ] **Step 1: Replace old control layout**

Use `.control-layout`, `.joystick-panel`, `.camera-feed`, `.command-log`, `.speed-panel`, `.v-slider-wrapper`.

- [ ] **Step 2: Preserve real drive behavior**

Drag joystick sends `drive(left,right,durationMs)` commands in cloud mode and local SoftAP payloads in local mode. Pointer release and page hide send STOP.

### Task 6: Patrol Tasks Screen

**Files:**
- Modify: `apps/web/src/views/Patrol.tsx`

**Interfaces:**
- Consumes: `api.createPatrol()`, `PatrolTask[]`, selected device.
- Produces: Open Design new task panel, task queue cards, and execution timeline.

- [ ] **Step 1: Replace old two-card patrol UI**

Use Open Design task panel, route template selector, one-click dispatch button, task queue cards, and timeline.

- [ ] **Step 2: Enforce permissions in UI**

Admin/operator can create tasks. Viewer sees the queue and timeline but creation controls are disabled with a clear reason.

### Task 7: Data And Agent Screen

**Files:**
- Modify: `apps/web/src/views/HistoryView.tsx`
- Modify: `apps/web/src/views/AgentView.tsx` or fold content into `HistoryView.tsx`

**Interfaces:**
- Consumes: readings, base stations, reports.
- Produces: Open Design three-column data dashboard with live metrics, trend charts, Agent summary, and link status.

- [ ] **Step 1: Port Open Design data dashboard**

Use `.data-dashboard`, `.metric-cards`, `.charts-stack`, `.agent-panel`, `.link-status-box`.

- [ ] **Step 2: Add range selector**

Support `1H`, `24H`, and `7D` UI states. Use available readings for now and aggregate/slice client-side.

### Task 8: Manage, Audit, And Debug Screen

**Files:**
- Modify: `apps/web/src/views/DeviceView.tsx`
- Modify: `apps/web/src/views/AuditView.tsx`
- Modify: `apps/web/src/views/BackendDebug.tsx`

**Interfaces:**
- Consumes: devices, base stations, audits, user role, backend debug handlers.
- Produces: Open Design admin dashboard with vehicle device, role permissions, base station, audit trace, and acceptance tools.

- [ ] **Step 1: Port management panels**

Render vehicle device, permission role cards, edge base station, and audit trace in the Open Design grid.

- [ ] **Step 2: Fold debug tools into manage screen**

Expose refresh, create command, create patrol, generate Agent, preview CSV, and preview JSON as admin-only compact tools.

### Task 9: Styles And Responsive Behavior

**Files:**
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: Open Design CSS class names.
- Produces: production CSS with dark/light theme tokens, landscape console layout, phone portrait fallback, bottom nav, modal, and touch-safe controls.

- [ ] **Step 1: Replace old CSS with Open Design tokens and classes**

Port CSS from the prototype into `styles.css`, removing old `.panel`-only layout assumptions where possible.

- [ ] **Step 2: Add mobile portrait adaptation**

The original prototype is landscape-heavy. Add portrait layout for APK: full-screen shell, bottom navigation, stacked content, no horizontal overflow, safe-area padding.

### Task 10: Parity, Build, APK, And Commit

**Files:**
- Modify: `deploy/check-app-parity.mjs`

**Interfaces:**
- Produces: updated parity check for five Open Design nav entries while retaining package/API checks.

- [ ] **Step 1: Run verification**

Run:

```powershell
npm run test --workspace apps/web
npm run build --workspace apps/web
npm run test --workspace apps/server
npm run build --workspace apps/server
npm run check:app-parity
npm run build:apk
```

Expected: all commands pass.

- [ ] **Step 2: Launch APK**

Run:

```powershell
adb install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p icu.rxcccccc.ws63patrol -c android.intent.category.LAUNCHER 1
```

Expected: app launches to the new Open Design UI and no black screen.

- [ ] **Step 3: Commit**

Run:

```powershell
git add apps/web deploy/check-app-parity.mjs docs/superpowers/plans/2026-07-08-opendesign-full-ui.md
git commit -m "Replace web UI with Open Design prototype"
```
