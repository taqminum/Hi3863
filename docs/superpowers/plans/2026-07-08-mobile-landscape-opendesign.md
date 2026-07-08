# Mobile Landscape Open Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Android APK use the Open Design console exactly in landscape, with fixed right-side tabs, scrollable non-control pages, and a single-screen non-scrollable remote-control page.

**Architecture:** Keep the existing Web dashboard as the browser/base-station information view. Add a native-Capacitor mobile route that renders the Open Design HTML as the visual source of truth and bridges it to the existing API/local-car runtime. The Open Design chart, modal, tooltip, time-range, nav, joystick, and speed-slider interaction logic must stay intact; only host selection, Android orientation, outer layout CSS, and data/control bridging may be added.

**Tech Stack:** React 19, TypeScript, Vite raw imports, Capacitor Android, AndroidManifest orientation lock, iframe `srcDoc`, `postMessage`, existing `apps/web/src/api.ts`, existing `apps/web/src/localCarApi.ts`, existing `apps/web/src/carProtocol.ts`.

## Global Constraints

- Focus only on the mobile/APK user experience for this implementation.
- Web browser behavior does not need to match the APK and may remain the current information dashboard.
- The APK must be landscape-only.
- The remote-control page must be landscape, one screen, and not scroll.
- The right-side tab column must remain fixed in landscape and must not scroll with page content.
- Non-control pages may scroll only by moving card/page layout around the existing Open Design structure.
- Do not change Open Design's original interactions: chart detail modal, chart axes, Chart.js tooltip/point press behavior, time toggles, nav switching, joystick drag, speed slider, theme toggle, and modal close.
- Do not modify firmware, gateway, or server code for this task.
- Do not commit `.env`, SQLite databases, `node_modules`, Android build output, or Open Design `dist/`.

---

## File Structure

- Create `apps/web/src/mobile/MobileConsoleApp.tsx`: mobile-only app host for APK, login, data runtime connection, and Open Design iframe.
- Create `apps/web/src/mobile/mobileOpenDesign.ts`: raw HTML loader, `srcDoc` CSS/bridge injection, message types, and snapshot mapping helpers.
- Create `apps/web/src/mobile/mobileOpenDesign.test.ts`: tests for orientation-independent bridge payloads and CSS injection guardrails.
- Create `apps/web/src/open-design/ws63e-inspection-app-full-8.html`: exact local copy of the latest approved Open Design HTML.
- Create `apps/web/src/WebConsoleApp.tsx`: moved current Web implementation from `App.tsx` so the browser information dashboard remains available.
- Modify `apps/web/src/App.tsx`: route to `MobileConsoleApp` only when running in Capacitor native Android; otherwise render `WebConsoleApp`.
- Modify `apps/web/android/app/src/main/AndroidManifest.xml`: lock `MainActivity` to landscape.
- Modify `apps/web/src/styles.css`: add only host-level frame/login rules for the mobile route; do not restyle Open Design internals here.
- Modify `deploy/check-app-parity.mjs`: replace old Web/APK parity checks with APK mobile checks: landscape manifest, mobile route, Open Design source, and APK cloud API.
- Add `docs/mobile-opendesign-handoff.md`: document how the mobile UI is sourced and which Open Design interactions must not be edited.

## Task 1: Preserve The Current Web Route And Add Native Routing

**Files:**
- Create: `apps/web/src/WebConsoleApp.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/mobile/mobileOpenDesign.test.ts`

**Interfaces:**
- Produces: `WebConsoleApp(): JSX.Element`
- Produces: `App(): JSX.Element` that chooses mobile only through `Capacitor.isNativePlatform()`

- [ ] **Step 1: Move current `App.tsx` implementation into `WebConsoleApp.tsx`**

Copy the current contents of `apps/web/src/App.tsx` into `apps/web/src/WebConsoleApp.tsx`, then rename the exported function:

```tsx
export function WebConsoleApp() {
  // existing current App body stays unchanged
}
```

Expected: no behavior change for browser Web.

- [ ] **Step 2: Replace `App.tsx` with platform routing**

`apps/web/src/App.tsx` becomes:

```tsx
import { Capacitor } from "@capacitor/core";
import { MobileConsoleApp } from "./mobile/MobileConsoleApp";
import { WebConsoleApp } from "./WebConsoleApp";

export function App() {
  if (Capacitor.isNativePlatform()) {
    return <MobileConsoleApp />;
  }
  return <WebConsoleApp />;
}
```

Expected: Web browser still uses current dashboard; APK uses mobile route.

- [ ] **Step 3: Run a type check**

Run:

```powershell
npm run test --workspace apps/web
```

Expected: TypeScript passes or fails only because `MobileConsoleApp` is not created yet. After Task 2 it must pass.

## Task 2: Add The Exact Open Design Mobile Source

**Files:**
- Create: `apps/web/src/open-design/ws63e-inspection-app-full-8.html`
- Create: `apps/web/src/mobile/mobileOpenDesign.ts`
- Test: `apps/web/src/mobile/mobileOpenDesign.test.ts`

**Interfaces:**
- Produces: `buildMobileOpenDesignSrcDoc(html: string): string`
- Produces: `MobileOpenDesignToHostMessage`
- Produces: `HostToMobileOpenDesignMessage`

- [ ] **Step 1: Copy the approved Open Design HTML**

Run:

```powershell
New-Item -ItemType Directory -Force apps\web\src\open-design
Copy-Item -LiteralPath 'C:\Users\rxccccc\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\4b4dda1f-479a-4f0f-9bb0-02cd40c0da9c\ws63e-inspection-app-full-8.html' -Destination 'apps\web\src\open-design\ws63e-inspection-app-full-8.html'
```

Expected: the copied file exists and has the same length as the Open Design source.

- [ ] **Step 2: Define bridge message types**

Create `apps/web/src/mobile/mobileOpenDesign.ts` with these exported types:

```ts
export type MobileOpenDesignTab = "overview" | "control" | "tasks" | "data" | "manage";

export interface MobileOpenDesignSnapshot {
  userLabel: string;
  roleLabel: string;
  connectionModeLabel: string;
  deviceName: string;
  deviceStatus: string;
  baseStationName: string;
  baseStationStatus: string;
  rssiLabel: string;
  cachedCountLabel: string;
  temperatureLabel: string;
  humidityLabel: string;
  lightnessLabel: string;
  commandStatus: string;
  taskStatus: string;
  agentSummary: string;
  notice: string;
  series: {
    rssi: number[];
    temperature: number[];
    humidity: number[];
    lightness: number[];
  };
}

export type MobileOpenDesignToHostMessage =
  | { source: "ws63-mobile-open-design"; type: "ready" }
  | { source: "ws63-mobile-open-design"; type: "active-tab"; tab: MobileOpenDesignTab }
  | { source: "ws63-mobile-open-design"; type: "drive"; left: number; right: number; speed: number; durationMs: number }
  | { source: "ws63-mobile-open-design"; type: "stop" }
  | { source: "ws63-mobile-open-design"; type: "create-patrol"; template: "standard" }
  | { source: "ws63-mobile-open-design"; type: "refresh-agent" }
  | { source: "ws63-mobile-open-design"; type: "logout" };

export interface HostToMobileOpenDesignMessage {
  source: "ws63-mobile-host";
  type: "snapshot";
  payload: MobileOpenDesignSnapshot;
}
```

- [ ] **Step 3: Inject only outer layout CSS and additive bridge JS**

`buildMobileOpenDesignSrcDoc(html)` must insert this CSS before `</head>`:

```css
<style id="ws63-mobile-landscape-patch">
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
body {
  background: #000;
}
.device-container {
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
.content-area {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.side-nav {
  flex: 0 0 80px !important;
  position: relative !important;
  z-index: 100 !important;
}
body[data-active-view="view-control"] .content-area {
  overflow: hidden !important;
}
body[data-active-view="view-control"] #view-control {
  height: 100% !important;
  overflow: hidden !important;
}
</style>
```

The injected JS must:

```js
(() => {
  const SOURCE = "ws63-mobile-open-design";
  const HOST = "ws63-mobile-host";
  function send(type, payload) {
    window.parent.postMessage({ source: SOURCE, type, ...(payload || {}) }, "*");
  }
  function setActiveView(target) {
    document.body.dataset.activeView = target;
    const map = {
      "view-overview": "overview",
      "view-control": "control",
      "view-tasks": "tasks",
      "view-data": "data",
      "view-manage": "manage"
    };
    if (map[target]) send("active-tab", { tab: map[target] });
  }
  window.addEventListener("load", () => {
    setActiveView("view-overview");
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => setActiveView(item.dataset.target));
    });
    send("ready");
  });
  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== HOST || message.type !== "snapshot") return;
    window.__ws63MobileSnapshot = message.payload;
  });
})();
```

Do not replace or remove the original Open Design script block.

- [ ] **Step 4: Test that original interactions are not removed**

Add tests:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMobileOpenDesignSrcDoc } from "./mobileOpenDesign";

test("injects mobile landscape patch without removing Open Design chart functions", () => {
  const html = "<html><head></head><body><script>window.openChartModal=function(){}; window.closeChartModal=function(){}</script></body></html>";
  const result = buildMobileOpenDesignSrcDoc(html);
  assert.match(result, /ws63-mobile-landscape-patch/);
  assert.match(result, /window\.openChartModal/);
  assert.match(result, /window\.closeChartModal/);
});

test("locks control view scrolling through active view CSS", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /body\[data-active-view="view-control"\] \.content-area/);
  assert.match(result, /overflow: hidden !important/);
});
```

Run:

```powershell
npm run test --workspace apps/web
```

Expected: tests pass after Task 3 creates the mobile app.

## Task 3: Build The Mobile Host Without Rewriting Open Design Interactions

**Files:**
- Create: `apps/web/src/mobile/MobileConsoleApp.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `buildMobileOpenDesignSrcDoc`
- Consumes: existing `api.login`, `api.dashboard`, `api.command`, `api.createPatrol`, `api.createReport`
- Consumes: existing `localCarApi.drive`, `localCarApi.stop`

- [ ] **Step 1: Add mobile iframe host**

`MobileConsoleApp.tsx` must:

```tsx
import { useMemo, useRef } from "react";
import prototypeHtml from "../open-design/ws63e-inspection-app-full-8.html?raw";
import { buildMobileOpenDesignSrcDoc } from "./mobileOpenDesign";

export function MobileConsoleApp() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => buildMobileOpenDesignSrcDoc(prototypeHtml), []);
  return <iframe ref={frameRef} title="WS63E mobile console" className="mobile-open-design-frame" srcDoc={srcDoc} />;
}
```

Then add the existing auth/data/command runtime from current Web implementation incrementally in the next steps.

- [ ] **Step 2: Add mobile login gate**

Before rendering the iframe, reuse `Login`:

```tsx
if (!token || !user) {
  return <Login onLogin={(nextToken, nextUser) => {
    localStorage.setItem("ws63-token", nextToken);
    localStorage.setItem("ws63-user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }} />;
}
```

Expected: APK still requires login; the console after login is Open Design.

- [ ] **Step 3: Add dashboard refresh and SSE**

Reuse the current `api.dashboard` and EventSource logic from `WebConsoleApp`. Keep the same token expiry behavior: if API returns `401`, clear token and return to login.

- [ ] **Step 4: Bridge joystick commands without changing joystick DOM/script**

In `onMessage`, handle:

```ts
if (message.type === "drive") {
  if (connectionMode === "local") {
    await localCarApi.drive(message.left, message.right, message.durationMs);
  } else {
    await api.command(token, {
      deviceId: selectedDevice.id,
      baseStationId: selectedDevice.base_station_id,
      action: "drive",
      speed: message.speed,
      left: message.left,
      right: message.right,
      durationMs: message.durationMs
    });
  }
}
if (message.type === "stop") {
  if (connectionMode === "local") await localCarApi.stop();
  else await api.command(token, { deviceId: selectedDevice.id, baseStationId: selectedDevice.base_station_id, action: "stop", speed: 0 });
}
```

The Open Design joystick `handleJoyStart`, `handleJoyMove`, `handleJoyEnd`, speed slider code, and knob transforms must remain as authored.

- [ ] **Step 5: Add host CSS only**

Append to `apps/web/src/styles.css`:

```css
.mobile-open-design-frame {
  display: block;
  width: 100vw;
  height: 100dvh;
  border: 0;
  background: #000;
}
```

Do not add CSS here that targets `.ov-data-card`, `.chart-wrapper`, `.joystick-base`, `.joystick-knob`, Chart.js canvas, or Open Design component internals.

## Task 4: Lock Android APK To Landscape

**Files:**
- Modify: `apps/web/android/app/src/main/AndroidManifest.xml`
- Modify: `deploy/check-app-parity.mjs`

**Interfaces:**
- Produces: Android `MainActivity` landscape-only behavior

- [ ] **Step 1: Add landscape orientation**

Modify the `<activity android:name=".MainActivity" ...>` tag:

```xml
android:screenOrientation="sensorLandscape"
```

Expected: the APK rotates only between landscape-left and landscape-right, never portrait.

- [ ] **Step 2: Update app parity check**

Add checks:

```js
check("Android APK locks to landscape", () => {
  const file = "apps/web/android/app/src/main/AndroidManifest.xml";
  const content = read(file);
  assertContains(file, content, 'android:screenOrientation="sensorLandscape"');
});

check("APK has mobile Open Design route", () => {
  const files = [
    "apps/web/src/App.tsx",
    "apps/web/src/mobile/MobileConsoleApp.tsx",
    "apps/web/src/mobile/mobileOpenDesign.ts",
    "apps/web/src/open-design/ws63e-inspection-app-full-8.html"
  ];
  const content = files.map(read).join("\n");
  assertContains("mobile Open Design route", content, "Capacitor.isNativePlatform");
  assertContains("mobile Open Design route", content, "ws63-mobile-landscape-patch");
  assertContains("mobile Open Design route", content, "view-control");
});
```

Keep the existing APK output and cloud API checks.

## Task 5: Verify APK Layout And Interactions On The Real Phone

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Build and test**

Run:

```powershell
npm run test --workspace apps/web
npm run build --workspace apps/web
npm run check:app-parity
npm run build:apk
```

Expected: all pass.

- [ ] **Step 2: Install to the real phone**

Use a real device, not emulator:

```powershell
adb devices -l
adb -s 10.109.198.56:41117 install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk
adb -s 10.109.198.56:41117 shell monkey -p icu.rxcccccc.ws63patrol -c android.intent.category.LAUNCHER 1
```

If the phone address changes:

```powershell
adb mdns services
adb connect <new-ip>:<new-port>
```

- [ ] **Step 3: Capture acceptance screenshots**

Run:

```powershell
adb -s 10.109.198.56:41117 shell screencap -p /sdcard/ws63-mobile-landscape.png
adb -s 10.109.198.56:41117 pull /sdcard/ws63-mobile-landscape.png $env:TEMP\ws63-mobile-landscape.png
```

Acceptance:

- APK opens in landscape.
- Right-side tab column is fixed.
- `总览`, `巡检`, `数据`, `管理` can scroll content if needed.
- `遥控` is a single landscape page and does not scroll.
- Chart card click opens the detailed modal.
- Detailed chart shows axes and tooltip behavior.
- Time range buttons still update chart data.
- Joystick and speed slider still drag normally.
- STOP/control commands still reach the existing API/local path.

## Task 6: Documentation And Commit

**Files:**
- Create: `docs/mobile-opendesign-handoff.md`
- Modify: implementation files from Tasks 1-4

- [ ] **Step 1: Write handoff document**

Create:

```markdown
# Mobile Open Design Handoff

The Android APK uses the Open Design source at:

`apps/web/src/open-design/ws63e-inspection-app-full-8.html`

The browser Web route remains the current information dashboard and is not required to match the APK.

Do not edit the original Open Design chart, modal, tooltip, time-toggle, nav, joystick, or speed-slider logic for layout changes. APK adaptation is done by `apps/web/src/mobile/mobileOpenDesign.ts`, which injects only outer landscape CSS and additive host bridge code.

The Android orientation lock is in:

`apps/web/android/app/src/main/AndroidManifest.xml`
```

- [ ] **Step 2: Inspect diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: no whitespace errors; changes are scoped to `apps/web`, `deploy/check-app-parity.mjs`, and docs.

- [ ] **Step 3: Commit after user acceptance**

Run:

```powershell
git add apps/web deploy/check-app-parity.mjs docs/mobile-opendesign-handoff.md docs/superpowers/plans/2026-07-08-mobile-landscape-opendesign.md
git commit -m "Add landscape mobile Open Design console"
```

Expected: one commit on `community/ws63e-env-gateway`.

## Self-Review

- Spec coverage: mobile is landscape-only, Web is not forced to match, right tabs are fixed, non-control pages can scroll, control page is non-scrollable, original Open Design interactions are protected, and real-phone APK verification is included.
- Placeholder scan: no placeholder steps remain.
- Type consistency: bridge source strings, snapshot names, tab names, and file paths are consistent across tasks.
