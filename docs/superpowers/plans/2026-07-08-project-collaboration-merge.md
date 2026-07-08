# Project Collaboration Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move active local development from `community/ws63e-env-gateway` to `codex/project-collaboration` while preserving the local Agent/history work and adopting the remote collaboration branch as the future base.

**Architecture:** Use `origin/codex/project-collaboration` as the new base because it contains the latest firmware, gateway, cloud bridge, and differential-drive integration. Merge local work from `community/ws63e-env-gateway` selectively: keep target-branch transport and drive protocol decisions, add the server history Agent API, preserve history visualization only where it does not regress the target branch mobile bridge.

**Tech Stack:** Git, Node.js workspaces, TypeScript server/client, React/Vite, Capacitor Android, WS63 firmware/gateway C code.

## Global Constraints

- Work on `community/ws63e-env-gateway` only until the new base branch is prepared; future development moves to `codex/project-collaboration`.
- Do not move work back to `main`; `main` remains backup/reference.
- Keep commits scoped and avoid generated Android/APK/build output.
- Preserve `codex/project-collaboration` differential-drive protocol: `cmd=drive`, `left/right`, `duration_ms`.
- Preserve `codex/project-collaboration` Android UDP plugin shape: `Ws63UdpPlugin` registered as `Ws63Udp`.
- Use the reachable cloud API host: `https://www.rxcccccc.icu/ws63-api`.
- Do not push without separate explicit confirmation.

---

### Task 1: Protect Local URL Fixes

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `apps/server/.env.example`
- Create: `docs/superpowers/plans/2026-07-08-project-collaboration-merge.md`

**Interfaces:**
- Consumes: existing local dirty changes that replace bare `https://rxcccccc.icu` with `https://www.rxcccccc.icu`.
- Produces: a local commit on `community/ws63e-env-gateway` that can be merged into `codex/project-collaboration`.

- [ ] **Step 1: Inspect dirty changes**

Run:

```powershell
git diff -- AGENTS.md README.md apps/server/.env.example
```

Expected: only cloud URL changes from bare domain to `www.rxcccccc.icu`.

- [ ] **Step 2: Stage the URL and plan files**

Run:

```powershell
git add -- AGENTS.md README.md apps/server/.env.example docs/superpowers/plans/2026-07-08-project-collaboration-merge.md
git diff --cached --name-status
```

Expected: the four files above are staged.

- [ ] **Step 3: Commit**

Run:

```powershell
git commit -m "Document project collaboration merge plan"
```

Expected: one local commit is created on `community/ws63e-env-gateway`.

### Task 2: Prepare Target Branch

**Files:**
- No direct file edits.

**Interfaces:**
- Consumes: `origin/codex/project-collaboration`.
- Produces: local branch `codex/project-collaboration` tracking the remote branch.

- [ ] **Step 1: Fetch target branch**

Run:

```powershell
git fetch origin codex/project-collaboration
```

Expected: `origin/codex/project-collaboration` is updated.

- [ ] **Step 2: Create or reset local target branch**

Run:

```powershell
git switch -c codex/project-collaboration --track origin/codex/project-collaboration
```

If the branch already exists, run:

```powershell
git switch codex/project-collaboration
git pull --ff-only
```

Expected: local `codex/project-collaboration` is clean and aligned with `origin/codex/project-collaboration`.

### Task 3: Merge Local Work Into Target

**Files With Expected Conflicts:**
- `apps/web/android/app/src/main/java/icu/rxcccccc/ws63patrol/MainActivity.java`
- `apps/web/src/mobile/MobileConsoleApp.tsx`
- `apps/web/src/mobile/mobileOpenDesign.ts`
- `apps/web/src/mobileOpenDesign.test.ts`
- `deploy/base-station-api.md`
- `docs/developer/car-gateway-integration.md`

**Interfaces:**
- Consumes: local commits on `community/ws63e-env-gateway`.
- Produces: merged working tree on `codex/project-collaboration`.

- [ ] **Step 1: Start a no-commit merge**

Run:

```powershell
git merge --no-commit --no-ff community/ws63e-env-gateway
```

Expected: Git reports conflicts in the expected overlapping mobile/docs files.

- [ ] **Step 2: Resolve service-side changes**

Keep or add:

```typescript
import { analyzeHistoryReadings, type MissingInterval } from "./agent-service.ts";
```

Keep target-branch command and ingest behavior. Add `readingsByTimeRange`, `normalizeUploadedReadings`, `normalizeMissingIntervals`, `/api/readings?from=&to=`, and `POST /api/agent/analyze-history`.

- [ ] **Step 3: Resolve Android UDP plugin conflict**

Keep `Ws63UdpPlugin`, not `UdpBridgePlugin`.

Expected `MainActivity.java` registration:

```java
registerPlugin(Ws63UdpPlugin.class);
```

- [ ] **Step 4: Resolve mobile control conflict**

Keep target-branch `buildDrivePayload` / `cmd=drive` semantics. Do not reintroduce `buildCompatPayloadFromWheels` for the APK control path. Add history/cache behavior only after preserving `mobileSessionAllowsLocalControl`, `shouldPollLocalTelemetry`, and `lastLocalControlAtRef`.

- [ ] **Step 5: Resolve docs**

Keep target-branch cloud bridge, router STA, and differential-drive documentation. Add only the non-conflicting history Agent and curve-gap notes. Keep all public cloud URLs on `https://www.rxcccccc.icu`.

### Task 4: Verify

**Files:**
- Test/build commands cover `apps/server`, `apps/web`, deployment checks, and APK packaging.

**Interfaces:**
- Consumes: resolved merge working tree.
- Produces: evidence before the final merge commit.

- [ ] **Step 1: Server tests**

Run:

```powershell
npm run test --workspace apps/server
```

Expected: all server tests pass.

- [ ] **Step 2: Web tests**

Run:

```powershell
npm run test --workspace apps/web
```

Expected: all web tests pass.

- [ ] **Step 3: Builds**

Run:

```powershell
npm run build --workspace apps/server
npm run build --workspace apps/web
```

Expected: both builds exit 0.

- [ ] **Step 4: APK parity and Android build**

Run:

```powershell
npm run check:app-parity
npm run build:apk
```

Expected: parity checks pass and Gradle reports `BUILD SUCCESSFUL`.

### Task 5: Commit And Report

**Files:**
- All resolved merge files.

**Interfaces:**
- Consumes: verified merge working tree.
- Produces: local commit on `codex/project-collaboration`, no push.

- [ ] **Step 1: Commit merge**

Run:

```powershell
git status --short
git commit
```

Expected: merge commit is created on `codex/project-collaboration`.

- [ ] **Step 2: Final status**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -5
git rev-list --left-right --count HEAD...origin/codex/project-collaboration
```

Expected: local `codex/project-collaboration` is ahead of remote and ready for future development.
