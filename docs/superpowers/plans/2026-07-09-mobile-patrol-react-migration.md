# Mobile Patrol React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Android APK patrol tab's Open Design iframe/DOM injection path with React components while keeping the visible patrol page fully matched to the current APK patrol tab.

**Architecture:** Keep `MobileConsoleApp` as the mobile runtime owner. Add a React-owned patrol tab rendered only when the active mobile tab is `tasks`; non-patrol tabs continue to use the current Open Design iframe path. Move patrol display mapping into a testable mobile patrol model so both UI and handlers use real task state instead of iframe snapshot replacement.

**Tech Stack:** React 19, TypeScript, Vite, Capacitor Android, Node built-in test runner, existing `apps/web` API clients, existing mobile gateway/car-direct APIs.

## Global Constraints

- The APK patrol page must be a visual clone of the current APK patrol tab, not a new design.
- Do not rewrite overview, control, data, or management tabs in this phase.
- Do not invent fake step-level patrol progress.
- Browser Web behavior stays separate from APK behavior.
- Cloud mode creates real patrol tasks through `POST /api/patrol-tasks`.
- Gateway and car-direct modes are local execution records and must be labeled truthfully.
- The real Android phone is the preferred verification target after APK-facing changes.
- Do not commit `.env`, SQLite databases, runtime data, Android build output, local screenshots, packaged archives, or `.gitnexus/`.

---

## File Structure

- Create `apps/web/src/mobile/patrol/mobilePatrolModel.ts`
  - Owns route templates, task parsing, status/timeline mapping, disabled reasons, and display props.
  - Exports pure functions used by React components and tests.

- Create `apps/web/src/mobile/patrol/MobilePatrolPage.tsx`
  - Owns the React patrol tab layout and delegates panels to small internal components.
  - Consumes display props from `mobilePatrolModel`.

- Create `apps/web/src/mobile/patrol/mobilePatrol.css`
  - Copies the current Open Design patrol-tab visual contract into scoped `.mobile-patrol-*` classes.
  - Keeps layout, colors, spacing, panels, task cards, and timeline visually equivalent.

- Create `apps/web/src/mobilePatrolModel.test.ts`
  - Tests route summaries, disabled states, cloud/local labeling, and timeline states.

- Create `apps/web/src/mobilePatrolPage.test.tsx`
  - Uses `react-dom/server` to render `MobilePatrolPage` and assert stable markup/classes without needing a browser.

- Modify `apps/web/src/mobile/MobileConsoleApp.tsx`
  - Track active tab from iframe messages.
  - Add typed patrol handlers called directly by React.
  - Render the React patrol tab when active tab is `tasks`, while leaving other tabs on the iframe.

- Modify `apps/web/src/mobile/mobileOpenDesign.ts`
  - Keep navigation and non-patrol snapshot behavior.
  - Stop replacing patrol queue/timeline DOM when React patrol is active.
  - Keep iframe task tab as a temporary visual background only if needed by the overlay strategy.

- Modify `apps/web/src/mobileOpenDesign.test.ts`
  - Replace tests that require iframe task queue replacement with tests proving patrol is React-owned.

- Modify `docs/mobile-opendesign-handoff.md`
  - Document that patrol has moved to React while other tabs remain iframe-owned for now.

- Modify `deploy/check-app-parity.mjs`
  - Update mobile checks so React patrol ownership is expected and Open Design patrol DOM replacement is not required.

---

### Task 1: Add Mobile Patrol Model

**Files:**
- Create: `apps/web/src/mobile/patrol/mobilePatrolModel.ts`
- Create: `apps/web/src/mobilePatrolModel.test.ts`

**Interfaces:**
- Consumes:
  - `PatrolTask`, `DeviceRecord`, `BaseStationRecord` from `apps/web/src/api.ts`
  - `ConnectionMode` from `apps/web/src/types.ts`
- Produces:
  - `MOBILE_PATROL_ROUTE_TEMPLATES: readonly MobilePatrolRouteTemplate[]`
  - `buildMobilePatrolModel(input: MobilePatrolModelInput): MobilePatrolModel`
  - `mobilePatrolTaskDetail(task: PatrolTask): string`
  - `mobilePatrolTimeline(task?: PatrolTask): MobilePatrolTimelineItem[]`

- [ ] **Step 1: Write the failing model tests**

Create `apps/web/src/mobilePatrolModel.test.ts` with:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BaseStationRecord, DeviceRecord, PatrolTask, User } from "./api.ts";
import { buildMobilePatrolModel, mobilePatrolTaskDetail, mobilePatrolTimeline } from "./mobile/patrol/mobilePatrolModel.ts";

const user: User = { id: "user-admin", username: "admin", displayName: "管理员", role: "admin" };
const device: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E 环境巡检小车 001",
  base_station_id: "sle-base-001",
  status: "online",
  connection_mode: "sle-gateway",
  direct_url: "",
  last_seen: "2026-07-09T08:00:00.000Z"
};
const base: BaseStationRecord = {
  id: "sle-base-001",
  name: "H3863 星闪基站",
  status: "online",
  location: "现场",
  last_seen: "2026-07-09T08:00:00.000Z"
};

function task(status: PatrolTask["status"], overrides: Partial<PatrolTask> = {}): PatrolTask {
  return {
    id: `task-${status}`,
    device_id: "ws63-car-001",
    base_station_id: "sle-base-001",
    name: "预检线路",
    steps_json: JSON.stringify([
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]),
    status,
    created_by: "user-admin",
    created_at: "2026-07-09T08:00:00.000Z",
    started_at: status === "running" || status === "completed" ? "2026-07-09T08:00:03.000Z" : null,
    finished_at: status === "completed" ? "2026-07-09T08:00:09.000Z" : null,
    ...overrides
  };
}

test("formats real patrol route steps without fake progress", () => {
  assert.equal(mobilePatrolTaskDetail(task("running")), "前进 45% 2s -> 左转 35% 0.6s -> 停止 0.5s");
});

test("maps patrol lifecycle to the current four-row mobile timeline", () => {
  assert.deepEqual(mobilePatrolTimeline(task("pending")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["等待基站拉取", "idle"],
    ["等待线路执行", "idle"],
    ["等待完成回执", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("running")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["基站已拉取", "done"],
    ["线路执行中", "active"],
    ["等待完成回执", "idle"]
  ]);
  assert.deepEqual(mobilePatrolTimeline(task("failed")).map((item) => [item.title, item.state]), [
    ["任务已创建", "done"],
    ["基站已拉取", "done"],
    ["线路执行失败", "error"],
    ["完成回执", "idle"]
  ]);
});

test("builds enabled cloud model from real device base station and tasks", () => {
  const model = buildMobilePatrolModel({
    user,
    token: "token",
    connectionMode: "cloud",
    selectedDevice: device,
    baseStations: [base],
    tasks: [task("pending")],
    cloudApiOnline: true,
    notice: ""
  });

  assert.equal(model.canCreate, true);
  assert.equal(model.deviceName, "WS63E 环境巡检小车 001");
  assert.equal(model.baseStationName, "H3863 星闪基站 在线");
  assert.equal(model.primaryActionLabel, "一键下发任务");
  assert.equal(model.cards[0].kind, "cloud");
  assert.equal(model.cards[0].statusLabel, "等待拉取");
});

test("blocks cloud creation when cloud API is offline", () => {
  const model = buildMobilePatrolModel({
    user,
    token: "token",
    connectionMode: "cloud",
    selectedDevice: device,
    baseStations: [base],
    tasks: [],
    cloudApiOnline: false,
    notice: "云服务器暂时不可达"
  });

  assert.equal(model.canCreate, false);
  assert.equal(model.disabledReason, "云服务器未连接");
});

test("labels gateway mode as local execution rather than a cloud task", () => {
  const model = buildMobilePatrolModel({
    user,
    token: null,
    connectionMode: "gateway",
    selectedDevice: device,
    baseStations: [base],
    tasks: [task("running", { id: "local-task-1", created_by: "local-field-operator" })],
    cloudApiOnline: false,
    notice: ""
  });

  assert.equal(model.canCreate, true);
  assert.equal(model.primaryActionLabel, "启动本地巡检");
  assert.equal(model.cards[0].kind, "local");
  assert.equal(model.cards[0].statusLabel, "本地执行中");
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm run test --workspace apps/web -- --test-name-pattern "patrol"
```

Expected: FAIL because `apps/web/src/mobile/patrol/mobilePatrolModel.ts` does not exist.

- [ ] **Step 3: Implement the model**

Create `apps/web/src/mobile/patrol/mobilePatrolModel.ts`:

```ts
import type { BaseStationRecord, DeviceRecord, PatrolTask, User } from "../../api";
import type { ConnectionMode } from "../../types";

export type MobilePatrolTimelineState = "idle" | "done" | "active" | "error";

export interface MobilePatrolRouteTemplate {
  id: "firmware-precheck" | "cloud-standard";
  label: string;
  name: string;
  steps: Array<{ action: "forward" | "backward" | "left" | "right" | "stop"; speed: number; durationMs: number }>;
}

export interface MobilePatrolTimelineItem {
  title: string;
  meta: string;
  state: MobilePatrolTimelineState;
}

export interface MobilePatrolTaskCard {
  id: string;
  kind: "cloud" | "local";
  name: string;
  status: PatrolTask["status"];
  statusLabel: string;
  detail: string;
  timeLabel: string;
  baseStationId: string;
}

export interface MobilePatrolModelInput {
  user: User | null;
  token: string | null;
  connectionMode: ConnectionMode;
  selectedDevice?: DeviceRecord;
  baseStations: BaseStationRecord[];
  tasks: PatrolTask[];
  cloudApiOnline: boolean;
  notice: string;
}

export interface MobilePatrolModel {
  deviceName: string;
  baseStationName: string;
  signalLabel: string;
  routeTemplates: readonly MobilePatrolRouteTemplate[];
  selectedTemplateId: MobilePatrolRouteTemplate["id"];
  defaultTaskName: string;
  estimatedDurationLabel: string;
  canCreate: boolean;
  disabledReason: string;
  primaryActionLabel: string;
  cards: MobilePatrolTaskCard[];
  timeline: MobilePatrolTimelineItem[];
  timelineStatusLabel: string;
  notice: string;
}

export const MOBILE_PATROL_ROUTE_TEMPLATES = [
  {
    id: "firmware-precheck",
    label: "固件预检线路",
    name: "预检线路",
    steps: [
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "left", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "right", speed: 35, durationMs: 600 },
      { action: "forward", speed: 45, durationMs: 2000 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]
  },
  {
    id: "cloud-standard",
    label: "云端巡检任务",
    name: "云端巡检任务",
    steps: [
      { action: "forward", speed: 50, durationMs: 1200 },
      { action: "left", speed: 40, durationMs: 500 },
      { action: "forward", speed: 45, durationMs: 1000 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]
  }
] as const satisfies readonly MobilePatrolRouteTemplate[];

const ACTION_LABELS: Record<string, string> = {
  forward: "前进",
  backward: "后退",
  left: "左转",
  right: "右转",
  stop: "停止"
};

const STATUS_LABELS: Record<PatrolTask["status"], string> = {
  pending: "等待拉取",
  pulled: "已拉取",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消"
};

function formatSeconds(durationMs: number): string {
  if (durationMs <= 0) return "";
  const seconds = durationMs / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
}

function formatTaskTime(task: PatrolTask): string {
  const value = task.finished_at ?? task.started_at ?? task.created_at;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--:--";
  return parsed.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function parseTaskSteps(task: PatrolTask): MobilePatrolRouteTemplate["steps"] {
  try {
    const parsed = JSON.parse(task.steps_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatStep(step: { action?: string; speed?: number; durationMs?: number; duration_ms?: number }): string {
  const action = String(step.action ?? "forward");
  const speed = Number(step.speed ?? 0);
  const duration = Number(step.durationMs ?? step.duration_ms ?? 0);
  const speedLabel = action === "stop" ? "" : ` ${Math.round(speed)}%`;
  const durationLabel = formatSeconds(duration);
  return `${ACTION_LABELS[action] ?? action}${speedLabel}${durationLabel ? ` ${durationLabel}` : ""}`;
}

export function mobilePatrolTaskDetail(task: PatrolTask): string {
  const steps = parseTaskSteps(task);
  if (steps.length === 0) return "等待基站执行路线";
  return steps.slice(0, 4).map(formatStep).join(" -> ");
}

export function mobilePatrolTimeline(task?: PatrolTask): MobilePatrolTimelineItem[] {
  if (!task) {
    return [
      { title: "等待创建巡检任务", meta: "云端、基站或小车直连均可发起", state: "idle" },
      { title: "等待基站拉取", meta: "任务创建后显示真实状态", state: "idle" },
      { title: "等待线路执行", meta: "执行进度由任务回执更新", state: "idle" },
      { title: "等待完成回执", meta: "完成或失败后在此处显示结果", state: "idle" }
    ];
  }
  if (task.status === "cancelled") {
    return [
      { title: "任务已创建", meta: formatTaskTime(task), state: "done" },
      { title: "任务已取消", meta: "任务已停止调度", state: "error" },
      { title: "线路未继续执行", meta: "未收到执行回执", state: "idle" },
      { title: "完成回执", meta: "任务取消，无完成回执", state: "idle" }
    ];
  }
  const pulled = ["pulled", "running", "completed", "failed"].includes(task.status);
  const running = ["running", "completed"].includes(task.status);
  return [
    { title: "任务已创建", meta: formatTaskTime(task), state: "done" },
    { title: pulled ? "基站已拉取" : "等待基站拉取", meta: pulled ? "任务已进入基站侧队列" : "等待巡检桥接或基站拉取", state: pulled ? "done" : "idle" },
    { title: task.status === "failed" ? "线路执行失败" : running ? "线路执行中" : "等待线路执行", meta: task.status === "failed" ? "执行失败，请检查基站和小车链路" : mobilePatrolTaskDetail(task), state: task.status === "failed" ? "error" : task.status === "running" ? "active" : running ? "done" : "idle" },
    { title: task.status === "completed" ? "完成回执" : "等待完成回执", meta: task.finished_at ? formatTaskTime(task) : "等待完成", state: task.status === "completed" ? "done" : "idle" }
  ];
}

function cardKind(task: PatrolTask): "cloud" | "local" {
  return task.id.startsWith("local-task-") || task.created_by === "local-field-operator" ? "local" : "cloud";
}

function cardStatusLabel(task: PatrolTask): string {
  if (cardKind(task) === "local" && task.status === "running") return "本地执行中";
  return STATUS_LABELS[task.status];
}

export function buildMobilePatrolModel(input: MobilePatrolModelInput): MobilePatrolModel {
  const selectedBase = input.baseStations.find((base) => base.id === input.selectedDevice?.base_station_id);
  const isCloud = input.connectionMode === "cloud";
  const disabledReason = !input.selectedDevice
    ? "未选择目标小车"
    : isCloud && !input.token
      ? "请先登录云端账号"
      : isCloud && !input.cloudApiOnline
        ? "云服务器未连接"
        : isCloud && !input.selectedDevice.base_station_id
          ? "未绑定基站"
          : "";
  const latestTask = input.tasks[0];

  return {
    deviceName: input.selectedDevice?.name ?? "未选择目标小车",
    baseStationName: selectedBase ? `${selectedBase.name} ${selectedBase.status === "online" ? "在线" : "离线"}` : input.selectedDevice?.base_station_id ?? "未绑定基站",
    signalLabel: "-- dBm",
    routeTemplates: MOBILE_PATROL_ROUTE_TEMPLATES,
    selectedTemplateId: isCloud ? "cloud-standard" : "firmware-precheck",
    defaultTaskName: isCloud ? "云端巡检任务" : "预检线路",
    estimatedDurationLabel: "约 7.7s",
    canCreate: disabledReason === "",
    disabledReason,
    primaryActionLabel: isCloud ? "一键下发任务" : "启动本地巡检",
    cards: input.tasks.slice(0, 5).map((task) => ({
      id: task.id,
      kind: cardKind(task),
      name: task.name,
      status: task.status,
      statusLabel: cardStatusLabel(task),
      detail: mobilePatrolTaskDetail(task),
      timeLabel: formatTaskTime(task),
      baseStationId: task.base_station_id
    })),
    timeline: mobilePatrolTimeline(latestTask),
    timelineStatusLabel: latestTask ? cardStatusLabel(latestTask) : "等待任务",
    notice: input.notice
  };
}
```

- [ ] **Step 4: Run model tests**

Run:

```powershell
npm run test --workspace apps/web -- --test-name-pattern "patrol"
```

Expected: PASS for `mobilePatrolModel.test.ts`; unrelated existing tests may also run and should continue passing.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- apps/web/src/mobile/patrol/mobilePatrolModel.ts apps/web/src/mobilePatrolModel.test.ts
git commit -m "Add mobile patrol view model"
```

---

### Task 2: Build The React Patrol Page Visual Clone

**Files:**
- Create: `apps/web/src/mobile/patrol/MobilePatrolPage.tsx`
- Create: `apps/web/src/mobile/patrol/mobilePatrol.css`
- Create: `apps/web/src/mobilePatrolPage.test.tsx`

**Interfaces:**
- Consumes:
  - `MobilePatrolModel` and `MobilePatrolRouteTemplate` from `mobilePatrolModel.ts`
- Produces:
  - `MobilePatrolPage(props: MobilePatrolPageProps): JSX.Element`
  - Props:
    - `model: MobilePatrolModel`
    - `taskName: string`
    - `templateId: MobilePatrolRouteTemplate["id"]`
    - `onTaskNameChange(value: string): void`
    - `onTemplateChange(value: MobilePatrolRouteTemplate["id"]): void`
    - `onCreate(): void`
    - `onRefresh(): void`
    - `onStop(): void`

- [ ] **Step 1: Write the failing render test**

Create `apps/web/src/mobilePatrolPage.test.tsx`:

```tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MobilePatrolPage } from "./mobile/patrol/MobilePatrolPage.tsx";
import type { MobilePatrolModel } from "./mobile/patrol/mobilePatrolModel.ts";

const model: MobilePatrolModel = {
  deviceName: "WS63E 环境巡检小车 001",
  baseStationName: "H3863 星闪基站 在线",
  signalLabel: "-- dBm",
  routeTemplates: [{
    id: "firmware-precheck",
    label: "固件预检线路",
    name: "预检线路",
    steps: [{ action: "forward", speed: 45, durationMs: 2000 }]
  }],
  selectedTemplateId: "firmware-precheck",
  defaultTaskName: "预检线路",
  estimatedDurationLabel: "约 7.7s",
  canCreate: true,
  disabledReason: "",
  primaryActionLabel: "一键下发任务",
  cards: [{
    id: "task-1",
    kind: "cloud",
    name: "预检线路",
    status: "running",
    statusLabel: "执行中",
    detail: "前进 45% 2s",
    timeLabel: "16:00:03",
    baseStationId: "sle-base-001"
  }],
  timeline: [
    { title: "任务已创建", meta: "16:00:00", state: "done" },
    { title: "基站已拉取", meta: "任务已进入基站侧队列", state: "done" },
    { title: "线路执行中", meta: "前进 45% 2s", state: "active" },
    { title: "等待完成回执", meta: "等待完成", state: "idle" }
  ],
  timelineStatusLabel: "执行中",
  notice: ""
};

test("renders a React clone of the mobile patrol three-column page", () => {
  const html = renderToStaticMarkup(
    <MobilePatrolPage
      model={model}
      taskName="预检线路"
      templateId="firmware-precheck"
      onTaskNameChange={() => undefined}
      onTemplateChange={() => undefined}
      onCreate={() => undefined}
      onRefresh={() => undefined}
      onStop={() => undefined}
    />
  );

  assert.match(html, /mobile-patrol-page/);
  assert.match(html, /mobile-patrol-layout/);
  assert.match(html, /新建任务/);
  assert.match(html, /任务队列 \(1\)/);
  assert.match(html, /执行步骤追踪/);
  assert.match(html, /WS63E 环境巡检小车 001/);
  assert.match(html, /一键下发任务/);
  assert.match(html, /线路执行中/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test --workspace apps/web -- --test-name-pattern "React clone"
```

Expected: FAIL because `MobilePatrolPage.tsx` does not exist.

- [ ] **Step 3: Implement the component and scoped CSS**

Create `apps/web/src/mobile/patrol/MobilePatrolPage.tsx`:

```tsx
import { Activity, List, PlusCircle, RadioTower, RefreshCcw, Send, Square, Cpu } from "lucide-react";
import "./mobilePatrol.css";
import type { MobilePatrolModel, MobilePatrolRouteTemplate } from "./mobilePatrolModel";

export interface MobilePatrolPageProps {
  model: MobilePatrolModel;
  taskName: string;
  templateId: MobilePatrolRouteTemplate["id"];
  onTaskNameChange: (value: string) => void;
  onTemplateChange: (value: MobilePatrolRouteTemplate["id"]) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onStop: () => void;
}

export function MobilePatrolPage({
  model,
  taskName,
  templateId,
  onTaskNameChange,
  onTemplateChange,
  onCreate,
  onRefresh,
  onStop
}: MobilePatrolPageProps) {
  return (
    <main className="mobile-patrol-page">
      <div className="mobile-patrol-layout">
        <section className="mobile-patrol-panel">
          <header className="mobile-patrol-panel-header"><span>新建任务</span><PlusCircle size={16} /></header>
          <div className="mobile-patrol-panel-body">
            <div className="mobile-patrol-status-summary">
              <div className="mobile-patrol-status-row"><span><Cpu size={12} />目标小车</span><strong>{model.deviceName}</strong></div>
              <div className="mobile-patrol-status-row"><span><RadioTower size={12} />边缘基站</span><strong className={model.baseStationName.includes("在线") ? "online" : ""}>{model.baseStationName}</strong></div>
              <div className="mobile-patrol-status-row"><span><Activity size={12} />链路信号</span><strong>{model.signalLabel}</strong></div>
            </div>
            <label className="mobile-patrol-form-group">
              <span>任务名称</span>
              <input value={taskName} onChange={(event) => onTaskNameChange(event.target.value)} />
            </label>
            <label className="mobile-patrol-form-group">
              <span>预设路线模板</span>
              <select value={templateId} onChange={(event) => onTemplateChange(event.target.value as MobilePatrolRouteTemplate["id"])}>
                {model.routeTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
            </label>
            <div className="mobile-patrol-estimate">预计时长 {model.estimatedDurationLabel}</div>
            <button className="mobile-patrol-primary" onClick={onCreate} disabled={!model.canCreate}>
              <Send size={16} />{model.canCreate ? model.primaryActionLabel : model.disabledReason}
            </button>
            <div className="mobile-patrol-actions">
              <button type="button" onClick={onRefresh}><RefreshCcw size={14} />刷新</button>
              <button type="button" onClick={onStop}><Square size={14} />停止</button>
            </div>
          </div>
        </section>

        <section className="mobile-patrol-panel">
          <header className="mobile-patrol-panel-header"><span>任务队列 ({model.cards.length})</span><List size={16} /></header>
          <div className="mobile-patrol-panel-body mobile-patrol-queue">
            {model.cards.length === 0 ? <div className="mobile-patrol-empty">等待手机端同步任务</div> : model.cards.map((card) => (
              <article className={`mobile-patrol-card ${card.status}`} key={card.id}>
                <div className="mobile-patrol-card-head"><strong>{card.name}</strong><span className={card.kind}>{card.statusLabel}</span></div>
                <div className="mobile-patrol-card-meta">{card.detail}</div>
                <div className="mobile-patrol-card-time">{card.timeLabel} · {card.baseStationId}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-patrol-panel">
          <header className="mobile-patrol-panel-header"><span>执行步骤追踪</span><div className="mobile-patrol-timeline-badge">{model.timelineStatusLabel}</div></header>
          <div className="mobile-patrol-panel-body">
            <div className="mobile-patrol-timeline">
              {model.timeline.map((item) => (
                <div className={`mobile-patrol-timeline-item ${item.state}`} key={`${item.title}-${item.state}`}>
                  <div className="mobile-patrol-timeline-marker" />
                  <div className="mobile-patrol-timeline-content">
                    <div className="mobile-patrol-timeline-title">{item.title}</div>
                    <div className="mobile-patrol-timeline-meta">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {model.notice ? <div className="mobile-patrol-notice">{model.notice}</div> : null}
    </main>
  );
}
```

Create `apps/web/src/mobile/patrol/mobilePatrol.css`:

```css
.mobile-patrol-page {
  position: absolute;
  inset: 0;
  z-index: 6;
  box-sizing: border-box;
  padding: clamp(10px, 2.2vh, 16px) calc(var(--ws63-system-right-reserve, 96px) + 12px) clamp(10px, 2.2vh, 16px) 16px;
  background: var(--bg-app, #0f1216);
  color: var(--fg-primary, #f4f7fb);
  font-family: var(--font-ui, "Inter", "Microsoft YaHei", sans-serif);
}

.mobile-patrol-layout {
  display: grid;
  grid-template-columns: minmax(190px, 0.72fr) minmax(0, 1fr) minmax(210px, 0.82fr);
  gap: 16px;
  height: 100%;
}

.mobile-patrol-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 16px;
  background: var(--bg-surface, #161a1f);
}

.mobile-patrol-panel-header {
  min-height: 42px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));
  background: var(--header-bg, rgba(255,255,255,0.03));
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}

.mobile-patrol-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 16px;
}

.mobile-patrol-status-summary {
  margin-bottom: 20px;
  padding: 12px;
  border: 1px solid var(--border-highlight, rgba(255,255,255,0.15));
  border-radius: 12px;
  background: var(--bg-surface-elevated, #1f242b);
}

.mobile-patrol-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 11px;
}

.mobile-patrol-status-row:last-child { margin-bottom: 0; }
.mobile-patrol-status-row span { display: flex; align-items: center; gap: 6px; color: var(--fg-secondary, #9aa4b2); }
.mobile-patrol-status-row strong { font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 500; text-align: right; }
.mobile-patrol-status-row strong.online { color: var(--color-cyan, #00e6a8); }

.mobile-patrol-form-group { display: block; margin-bottom: 16px; }
.mobile-patrol-form-group span { display: block; margin-bottom: 8px; font-size: 11px; color: var(--fg-secondary, #9aa4b2); }
.mobile-patrol-form-group input,
.mobile-patrol-form-group select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 8px;
  background: var(--bg-surface-elevated, #1f242b);
  color: var(--fg-primary, #f4f7fb);
  padding: 10px 12px;
  font-size: 12px;
  outline: none;
}

.mobile-patrol-estimate { margin: -4px 0 12px; color: var(--fg-tertiary, #6f7a88); font-size: 10px; font-family: var(--font-mono, monospace); }
.mobile-patrol-primary {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, var(--color-cyan, #00e6a8) 0%, #00c48f 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 12px var(--color-cyan-glow, rgba(0,230,168,0.22));
}
.mobile-patrol-primary:disabled { opacity: .55; box-shadow: none; }
.mobile-patrol-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.mobile-patrol-actions button { border: 1px solid var(--border-color, rgba(255,255,255,0.1)); border-radius: 8px; background: var(--bg-surface-elevated, #1f242b); color: var(--fg-secondary, #9aa4b2); padding: 9px; display: flex; align-items: center; justify-content: center; gap: 6px; }

.mobile-patrol-queue { display: flex; flex-direction: column; gap: 12px; }
.mobile-patrol-card {
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-left-width: 4px;
  border-radius: 12px;
  background: var(--bg-surface-elevated, #1f242b);
  padding: 14px;
}
.mobile-patrol-card.running { border-left-color: var(--color-cyan, #00e6a8); border-color: var(--color-cyan, #00e6a8); background: linear-gradient(90deg, rgba(0,230,168,.08) 0%, rgba(31,36,43,0) 100%); }
.mobile-patrol-card.pending { border-left-color: var(--fg-tertiary, #6f7a88); }
.mobile-patrol-card.failed { border-left-color: var(--color-red, #ff5c5c); }
.mobile-patrol-card-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.mobile-patrol-card-head strong { font-family: var(--font-mono, monospace); font-size: 13px; }
.mobile-patrol-card-head span { border-radius: 12px; border: 1px solid var(--border-highlight, rgba(255,255,255,.15)); padding: 2px 8px; font-size: 10px; color: var(--color-cyan, #00e6a8); }
.mobile-patrol-card-head span.local { color: #ffd166; }
.mobile-patrol-card-meta { margin-bottom: 4px; color: var(--fg-secondary, #9aa4b2); font-size: 11px; }
.mobile-patrol-card-time { color: var(--fg-tertiary, #6f7a88); font-size: 10px; font-family: var(--font-mono, monospace); }
.mobile-patrol-empty { color: var(--fg-tertiary, #6f7a88); font-size: 12px; }

.mobile-patrol-timeline-badge { border: 1px solid var(--color-cyan-glow, rgba(0,230,168,.22)); border-radius: 12px; background: rgba(0,230,168,.1); color: var(--color-cyan, #00e6a8); padding: 2px 8px; font-size: 10px; font-family: var(--font-mono, monospace); }
.mobile-patrol-timeline { position: relative; padding: 4px 0 4px 20px; }
.mobile-patrol-timeline::before { content: ""; position: absolute; left: 5px; top: 12px; bottom: 12px; width: 2px; border-radius: 1px; background: var(--border-color, rgba(255,255,255,.1)); }
.mobile-patrol-timeline-item { position: relative; margin-bottom: 24px; }
.mobile-patrol-timeline-item:last-child { margin-bottom: 0; }
.mobile-patrol-timeline-marker { position: absolute; left: -21px; top: 0; width: 14px; height: 14px; border-radius: 50%; background: var(--bg-surface, #161a1f); border: 2px solid var(--border-color, rgba(255,255,255,.1)); z-index: 2; }
.mobile-patrol-timeline-item.done .mobile-patrol-timeline-marker { background: var(--color-cyan, #00e6a8); border-color: var(--color-cyan, #00e6a8); }
.mobile-patrol-timeline-item.active .mobile-patrol-timeline-marker { border-color: var(--color-cyan, #00e6a8); box-shadow: 0 0 0 4px var(--color-cyan-glow, rgba(0,230,168,.22)); }
.mobile-patrol-timeline-item.error .mobile-patrol-timeline-marker { border-color: var(--color-red, #ff5c5c); }
.mobile-patrol-timeline-content { padding-left: 12px; }
.mobile-patrol-timeline-title { margin-bottom: 6px; font-size: 13px; font-weight: 500; }
.mobile-patrol-timeline-item.active .mobile-patrol-timeline-title { color: var(--color-cyan, #00e6a8); font-weight: 600; }
.mobile-patrol-timeline-item.error .mobile-patrol-timeline-title { color: var(--color-red, #ff5c5c); }
.mobile-patrol-timeline-meta { display: inline-flex; border-radius: 6px; background: var(--bg-surface-elevated, #1f242b); color: var(--fg-tertiary, #6f7a88); padding: 4px 8px; font-size: 11px; font-family: var(--font-mono, monospace); }
.mobile-patrol-notice { position: absolute; left: 16px; bottom: 10px; max-width: calc(100% - 128px); color: #ffd166; font-size: 11px; }
```

- [ ] **Step 4: Run render tests**

Run:

```powershell
npm run test --workspace apps/web -- --test-name-pattern "React clone"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- apps/web/src/mobile/patrol/MobilePatrolPage.tsx apps/web/src/mobile/patrol/mobilePatrol.css apps/web/src/mobilePatrolPage.test.tsx
git commit -m "Add React mobile patrol page"
```

---

### Task 3: Wire React Patrol Into The Mobile Runtime

**Files:**
- Modify: `apps/web/src/mobile/MobileConsoleApp.tsx`

**Interfaces:**
- Consumes:
  - `MobilePatrolPage`
  - `buildMobilePatrolModel`
  - `MOBILE_PATROL_ROUTE_TEMPLATES`
- Produces:
  - `activeTab` state in `MobileConsoleApp`
  - direct handlers `createMobilePatrol()`, `stopMobilePatrol()`

- [ ] **Step 1: Add runtime state and imports**

Modify the imports in `apps/web/src/mobile/MobileConsoleApp.tsx`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobilePatrolPage } from "./patrol/MobilePatrolPage";
import {
  buildMobilePatrolModel,
  MOBILE_PATROL_ROUTE_TEMPLATES,
  type MobilePatrolRouteTemplate
} from "./patrol/mobilePatrolModel";
```

Add state near existing state declarations:

```ts
const [activeTab, setActiveTab] = useState<"overview" | "control" | "tasks" | "data" | "manage">("overview");
const [patrolTaskName, setPatrolTaskName] = useState("预检线路");
const [patrolTemplateId, setPatrolTemplateId] = useState<MobilePatrolRouteTemplate["id"]>("firmware-precheck");
```

- [ ] **Step 2: Track active tab from iframe messages**

Inside `handleBridgeMessage`, after the `ready` branch and before action handling, add:

```ts
if (message.type === "active-tab") {
  setActiveTab(message.tab);
  return;
}
```

Expected: the iframe remains the nav owner; React patrol appears only after the existing nav reports `tasks`.

- [ ] **Step 3: Add direct patrol handlers**

Add these callbacks before `handleBridgeMessage`:

```ts
const selectedPatrolTemplate = useMemo(
  () => MOBILE_PATROL_ROUTE_TEMPLATES.find((template) => template.id === patrolTemplateId) ?? MOBILE_PATROL_ROUTE_TEMPLATES[0],
  [patrolTemplateId]
);

const createMobilePatrol = useCallback(async () => {
  await guarded(async () => {
    if (connectionMode === "gateway") {
      lastLocalControlAtRef.current = Date.now();
      await gatewayApi.sendControl({ cmd: "auto_start" });
      setTasks((current) => buildLocalPatrolTask({
        currentTasks: current,
        deviceId: selectedDevice.id,
        baseStationId: selectedDevice.base_station_id,
        mode: "gateway"
      }));
      setNotice("已向星闪基站发送自动巡检启动指令");
      return;
    }
    if (connectionMode === "car-direct") {
      lastLocalControlAtRef.current = Date.now();
      await localCarApi.send({ cmd: "auto_start" });
      setTasks((current) => buildLocalPatrolTask({
        currentTasks: current,
        deviceId: selectedDevice.id,
        baseStationId: selectedDevice.base_station_id,
        mode: "car-direct"
      }));
      setNotice("已向小车直连发送自动巡检启动指令");
      return;
    }
    if (!token || token.startsWith("local-demo:")) {
      setNotice("请先登录云端账号再创建巡检任务。");
      return;
    }
    await api.createPatrol(token, {
      deviceId: selectedDevice.id,
      baseStationId: selectedDevice.base_station_id,
      name: patrolTaskName.trim() || selectedPatrolTemplate.name,
      steps: [...selectedPatrolTemplate.steps]
    });
    setNotice("巡检任务已推送到云端任务队列，等待基站拉取");
    await refresh();
  });
}, [connectionMode, guarded, patrolTaskName, refresh, selectedDevice.base_station_id, selectedDevice.id, selectedPatrolTemplate, token]);

const stopMobilePatrol = useCallback(async () => {
  await guarded(async () => {
    if (connectionMode === "gateway") {
      lastLocalControlAtRef.current = Date.now();
      await gatewayApi.sendControl({ cmd: "auto_stop" });
      setNotice("已向星闪基站发送停止预检指令");
      return;
    }
    if (connectionMode === "car-direct") {
      lastLocalControlAtRef.current = Date.now();
      await localCarApi.send({ cmd: "auto_stop" });
      setNotice("已向小车直连发送停止预检指令");
      return;
    }
    setNotice("云端巡检停止需要任务取消接口；当前请等待桥接回执或检查基站链路。");
  });
}, [connectionMode, guarded]);
```

- [ ] **Step 4: Build patrol model and render overlay**

Add:

```ts
const patrolModel = useMemo(() => buildMobilePatrolModel({
  user,
  token,
  connectionMode,
  selectedDevice,
  baseStations,
  tasks,
  cloudApiOnline,
  notice
}), [baseStations, cloudApiOnline, connectionMode, notice, selectedDevice, tasks, token, user]);
```

Replace the final return with:

```tsx
return (
  <div className="mobile-console-host">
    <iframe
      ref={frameRef}
      title="WS63E mobile console"
      className="mobile-open-design-frame"
      srcDoc={srcDoc}
      onLoad={postSnapshot}
    />
    {activeTab === "tasks" ? (
      <MobilePatrolPage
        model={patrolModel}
        taskName={patrolTaskName}
        templateId={patrolTemplateId}
        onTaskNameChange={setPatrolTaskName}
        onTemplateChange={setPatrolTemplateId}
        onCreate={() => void createMobilePatrol()}
        onRefresh={() => void guarded(() => refresh())}
        onStop={() => void stopMobilePatrol()}
      />
    ) : null}
  </div>
);
```

Add this CSS to `apps/web/src/styles.css` only if `.mobile-console-host` does not already exist:

```css
.mobile-console-host {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #0f1216;
}
```

- [ ] **Step 5: Run web tests and build**

Run:

```powershell
npm run test --workspace apps/web
npm run build --workspace apps/web
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- apps/web/src/mobile/MobileConsoleApp.tsx apps/web/src/styles.css
git commit -m "Route mobile patrol tab to React"
```

---

### Task 4: Retire Patrol DOM Replacement From The Iframe Bridge

**Files:**
- Modify: `apps/web/src/mobile/mobileOpenDesign.ts`
- Modify: `apps/web/src/mobileOpenDesign.test.ts`

**Interfaces:**
- Consumes:
  - `active-tab` messages from existing iframe bridge.
- Produces:
  - No patrol queue/timeline DOM replacement requirement for React-owned patrol.

- [ ] **Step 1: Update tests to expect React patrol ownership**

In `apps/web/src/mobileOpenDesign.test.ts`, replace the test named `"bridge replaces mock patrol cards and timeline from live snapshot"` with:

```ts
test("bridge still reports tasks tab activation for the React patrol overlay", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.match(result, /send\("active-tab", \{ tab: map\[target\] \}\)/);
  assert.match(result, /tasks: "tasks"/);
});
```

Replace the test named `"bridge suppresses Open Design inline patrol handlers before sending real patrol request"` with:

```ts
test("iframe patrol create handler is no longer the primary React patrol path", () => {
  const result = buildMobileOpenDesignSrcDoc("<html><head></head><body></body></html>");
  assert.doesNotMatch(result, /send\("create-patrol", \{ template: "standard" \}\)/);
});
```

- [ ] **Step 2: Remove patrol create capture and queue replacement from bridge script**

In `apps/web/src/mobile/mobileOpenDesign.ts`, remove the `document.querySelector(".btn-primary")?.addEventListener` block from `attachControlBridge` whose body calls `send("create-patrol", { template: "standard" })`.

Search for these exact function names:

```powershell
rg -n "updateTaskQueue|updateTaskTimeline" apps/web/src/mobile/mobileOpenDesign.ts
```

If the only remaining references are the function declarations and the snapshot application path, delete both function declarations and delete their calls from the snapshot application path:

```ts
updateTaskQueue(snapshot);
updateTaskTimeline(snapshot);
```

Expected: iframe still sends active-tab, drive, stop, history-range, connection-mode, refresh-agent, logout; React handles patrol create/stop.

- [ ] **Step 3: Run focused bridge tests**

Run:

```powershell
npm run test --workspace apps/web -- --test-name-pattern "React patrol|tasks tab activation|iframe patrol"
```

Expected: PASS.

- [ ] **Step 4: Run full web tests**

Run:

```powershell
npm run test --workspace apps/web
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- apps/web/src/mobile/mobileOpenDesign.ts apps/web/src/mobileOpenDesign.test.ts
git commit -m "Stop iframe patrol DOM replacement"
```

---

### Task 5: Update Documentation And Parity Checks

**Files:**
- Modify: `docs/mobile-opendesign-handoff.md`
- Modify: `deploy/check-app-parity.mjs`

**Interfaces:**
- Consumes:
  - React patrol files from Tasks 1-4.
- Produces:
  - Documentation and parity checks aligned with React patrol ownership.

- [ ] **Step 1: Update handoff documentation**

Modify `docs/mobile-opendesign-handoff.md` so the top section reads:

```md
# Mobile UI Handoff

The Android APK currently uses a hybrid mobile shell.

- `overview`, `control`, `data`, and `manage` still render through the Open Design iframe source at `apps/web/src/open-design/ws63e-inspection-app-full-8.html`.
- `tasks` / `巡检` is React-owned and implemented under `apps/web/src/mobile/patrol/`.
- The React patrol page must visually replicate the current APK patrol tab. It is a rendering-path migration, not a redesign.

The browser Web route remains the current information dashboard and is not required to match the APK.
```

Keep the existing Android orientation and route-selection notes.

- [ ] **Step 2: Update parity script**

Open `deploy/check-app-parity.mjs`. Add checks equivalent to:

```js
check("APK patrol tab is React-owned", () => {
  assertContains(
    "mobile patrol React page",
    read("apps/web/src/mobile/MobileConsoleApp.tsx"),
    "MobilePatrolPage"
  );
  assertContains(
    "mobile patrol model",
    read("apps/web/src/mobile/patrol/mobilePatrolModel.ts"),
    "buildMobilePatrolModel"
  );
  assertContains(
    "mobile patrol styles",
    read("apps/web/src/mobile/patrol/mobilePatrol.css"),
    "mobile-patrol-layout"
  );
});
```

If the helper names differ, use the existing helper style in `deploy/check-app-parity.mjs`; do not introduce a new assertion framework.

- [ ] **Step 3: Run parity check**

Run:

```powershell
npm run check:app-parity
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

```powershell
git add -- docs/mobile-opendesign-handoff.md deploy/check-app-parity.mjs
git commit -m "Document React-owned mobile patrol tab"
```

---

### Task 6: Build, Install, And Visually Verify On Real Phone

**Files:**
- No source files expected.
- Runtime artifacts under `artifacts/` may be created for local inspection but must not be committed.

**Interfaces:**
- Consumes:
  - Completed React patrol migration from Tasks 1-5.
- Produces:
  - Real-phone launch and visual verification notes.

- [ ] **Step 1: Run final software verification**

Run:

```powershell
npm run test
npm run build
npm run check:app-parity
```

Expected: all PASS.

- [ ] **Step 2: Build or sync APK**

Run:

```powershell
npm run build:apk
```

Expected: debug APK exists at `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 3: Find the real phone**

Run:

```powershell
adb devices
adb mdns services
```

Expected: one usable real device is listed. If Wi-Fi ADB is needed, connect with:

```powershell
adb connect <ip:port>
```

- [ ] **Step 4: Install and launch**

Run:

```powershell
adb -s <device> install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk
adb -s <device> shell monkey -p icu.rxcccccc.ws63patrol -c android.intent.category.LAUNCHER 1
```

Expected: APK launches in landscape.

- [ ] **Step 5: Capture patrol screenshot**

Navigate to `巡检` in the APK, then run:

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
adb -s <device> shell screencap -p /sdcard/ws63-react-patrol.png
adb -s <device> pull /sdcard/ws63-react-patrol.png artifacts/ws63-react-patrol.png
```

Expected: screenshot shows the same three-column patrol page composition as the current APK: create panel, task queue, timeline, same dark visual system, same right-side nav context.

- [ ] **Step 6: Verify cloud task creation**

In cloud mode, tap create patrol once.

Expected:

- The task appears in the React task queue.
- Status begins as `等待拉取` or equivalent.
- No fake per-step progress appears.
- The cloud server receives a real patrol task.

Optional command for cloud-side confirmation:

```powershell
$token = "<admin token from current session if available>"
Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } -Uri "https://www.rxcccccc.icu/ws63-api/api/patrol-tasks"
```

- [ ] **Step 7: Verify local stop paths**

Switch to `gateway` or `car-direct` mode, tap create patrol, then stop.

Expected:

- Create sends `auto_start`.
- Stop sends `auto_stop`.
- The task card is labeled as local execution, not a cloud task.

- [ ] **Step 8: Final commit only if verification required source changes**

If verification required any source/doc/test fixes, commit them:

```powershell
git status --short
git add -- <changed source files only>
git commit -m "Verify mobile patrol React migration"
```

If no source changes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- React-owned APK patrol tab: Tasks 2, 3, and 4.
- Visual clone requirement: Task 2 CSS and Task 6 real-phone screenshot.
- Real cloud task lifecycle: Tasks 1 and 3.
- Gateway/car-direct truthfulness: Tasks 1, 3, and 6.
- No fake step progress: Tasks 1 and 6.
- Non-patrol tabs left on iframe: Task 3.
- Tests: Tasks 1, 2, 4, 5, and 6.
- Documentation: Task 5.

Placeholder scan:

- No unresolved placeholder steps or unspecified test commands remain.

Type consistency:

- `MobilePatrolRouteTemplate["id"]`, `MobilePatrolModel`, `MobilePatrolTimelineItem`, and `buildMobilePatrolModel` are defined in Task 1 and consumed in Tasks 2 and 3.
- `MobilePatrolPageProps` is defined in Task 2 and consumed in Task 3.
- `activeTab` uses the existing mobile tab union values emitted by `MobileOpenDesignToHostMessage`.
