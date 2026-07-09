# Mobile Patrol React Migration Design

## Goal

Migrate only the Android APK patrol page from the current Open Design iframe injection path to first-class React components, while keeping the user-visible patrol page visually and behaviorally identical to the current APK screen.

This is a rendering and data-flow migration, not a redesign. The React patrol page must fully replicate the current APK patrol tab: landscape layout, dark theme, panel proportions, spacing, typography, task cards, timeline, route template selector, button placement, status badges, empty states, and tab-switching behavior. The visible result should look like the existing APK patrol page; the difference is that React owns the component tree and uses real application state directly. User-facing Chinese copy should be copied from the current APK screen unless the current copy is misleading for real state.

## Scope

In scope:

- Replace the APK patrol tab implementation with React-rendered mobile patrol components.
- Preserve the current APK visual shell and patrol-page layout exactly enough for side-by-side screenshots to match within small rendering differences.
- Use the existing cloud patrol task APIs and mobile runtime state directly.
- Keep cloud, gateway, and car-direct patrol behavior explicit and truthful.
- Keep browser Web behavior separate from APK behavior.
- Add focused tests for patrol view model/data mapping and mobile routing behavior.
- Update mobile handoff documentation so the patrol tab is no longer documented as Open Design-owned.

Out of scope for this phase:

- Rewriting the control, overview, data, or management tabs.
- Redesigning the APK visual language.
- Adding fake step-level patrol progress.
- Changing firmware patrol route behavior.
- Replacing the cloud patrol task schema unless needed for a narrow bug fix.

## Current State

The APK currently renders `MobileConsoleApp` as an `iframe srcDoc` containing `apps/web/src/open-design/ws63e-inspection-app-full-8.html`. Runtime code in `apps/web/src/mobile/mobileOpenDesign.ts` injects host bridge logic and replaces task queue and timeline content from React state.

The data backing patrol is partly real:

- Cloud mode creates real tasks through `POST /api/patrol-tasks`.
- Dashboard refresh and SSE events populate `dashboard.recentTasks`.
- The server supports `pending`, `pulled`, `running`, `completed`, `failed`, and `cancelled` patrol task states.
- The PC patrol bridge can pull pending tasks, send UDP control steps, and write status back.
- Gateway and car-direct modes send `auto_start` directly and create a local display task.

The weak points are implementation ownership and truthfulness:

- The patrol UI is still tied to an old prototype iframe.
- Cloud patrol creation uses a fixed APK task name and fixed steps.
- Local direct modes show local synthetic tasks, which should remain clearly labeled as local execution records.
- The current UI cannot truthfully show per-step progress because no step-level bridge/API/DB acknowledgement exists.

## Recommended Approach

Use a hybrid mobile shell during this phase:

- Keep the existing iframe shell for non-patrol tabs.
- Intercept or mirror the active mobile tab in `MobileConsoleApp`.
- When the active tab is `tasks`, render a React patrol page over or instead of the iframe content.
- When the active tab is any other page, continue using the current iframe behavior.

This keeps the blast radius limited to patrol while removing the old prototype from the patrol implementation. It also avoids destabilizing joystick multi-touch, chart behavior, and the other mobile pages while this page is being made real.

Alternative approaches considered:

- Full APK rewrite in React now: cleaner long-term, but too much risk because control and data pages include sensitive interactions.
- Continue patching the iframe: lowest short-term cost, but it keeps the exact technical debt the user wants to remove.

## Visual Parity Contract

The React patrol page must be a visual clone of the current APK patrol tab, not a new design.

Required parity:

- Landscape-first layout with the same right-side mobile navigation context.
- Three patrol columns matching the current task creation, task queue, and execution timeline composition.
- Same dark background, elevated surfaces, border colors, badge treatment, task-card density, and timeline marker style.
- Same compact control rhythm suitable for phone landscape use.
- Same scroll policy: patrol content may scroll only if needed, but it must preserve the current page composition.
- Same Chinese labels unless a label is inaccurate because the new implementation is showing real state.

Allowed visible changes:

- Remove stale mock values such as `Auto-Inspect-094`.
- Replace misleading copy with a truthful equivalent, for example the current Chinese wording for "waiting for base-station pull" instead of simulated step progress.
- Show clear local-mode labels for gateway/car-direct execution records.
- Show actionable empty/error states when cloud, device, or base-station state is missing.

Verification should use side-by-side screenshots of the current APK patrol page and the React patrol page on the real phone, plus desktop emulation as a secondary check.

## Components

Create a narrow component set under `apps/web/src/mobile/patrol/` or an equivalent mobile-local folder:

- `MobilePatrolPage`
  - Owns the patrol tab layout.
  - Receives already-loaded mobile app state and event handlers from `MobileConsoleApp`.
  - Does not fetch directly except through passed callbacks.

- `MobilePatrolCreatePanel`
  - Shows selected car, base station, connection mode, route template, estimated duration, and primary dispatch button.
  - Uses real route definitions instead of hardcoded mock names.

- `MobilePatrolQueue`
  - Renders recent patrol tasks with status badge, base station, creation/update time, and route summary.
  - Separates cloud tasks from local execution records when both exist.

- `MobilePatrolTimeline`
  - Maps task-level status to the existing timeline visual treatment.
  - Does not invent step-level progress.

- `mobilePatrolModel`
  - Converts `PatrolTask[]`, `DeviceRecord`, `BaseStationRecord`, `ConnectionMode`, and cloud health into display-ready props.
  - Centralizes task status labels, route summaries, empty states, and allowed actions.

## Data Flow

Cloud mode:

1. User taps create patrol on the React patrol page.
2. `MobileConsoleApp` calls `api.createPatrol(token, { deviceId, baseStationId, name, steps })`.
3. The server creates a `pending` task.
4. SSE `patrol` or manual refresh updates `tasks`.
5. Bridge/base station pulls the task and the server marks it `pulled`.
6. Bridge marks it `running`, then `completed` or `failed`.
7. React timeline reflects these real task states.

Gateway mode:

1. User taps create patrol.
2. `gatewayApi.sendControl({ cmd: "auto_start" })` is sent.
3. UI adds a local execution record clearly labeled as local/gateway execution.
4. Stop sends `auto_stop`.

Car-direct mode:

1. User taps create patrol.
2. `localCarApi.send({ cmd: "auto_start" })` is sent.
3. UI adds a local execution record clearly labeled as local/car-direct execution.
4. Stop sends `auto_stop`.

The React page should not depend on the iframe bridge for patrol actions. It should call typed handlers in `MobileConsoleApp` directly.

## Error Handling

The page must show truthful failure states:

- Not logged in or local demo token in cloud mode: block cloud task creation and ask the user to log in.
- No selected device: disable creation and show the current Chinese wording for "no target car selected".
- Missing base station: disable cloud patrol creation and show the current Chinese wording for "no base station bound".
- Cloud API offline: disable cloud patrol creation and show cloud offline status.
- Task stuck in `pending`: show the current Chinese wording for "waiting for patrol bridge or base-station pull".
- Task `failed`: show the server error message when available; otherwise show a concise chain-check hint.
- Gateway/car-direct send failure: show a local failure notice and do not present it as a cloud task.

## Testing

Focused automated checks:

- Unit test `mobilePatrolModel` for:
  - cloud task route summaries from `steps_json`;
  - pending/pulled/running/completed/failed/cancelled timeline mapping;
  - local execution record labeling;
  - cloud offline and missing-device disabled states.
- Component-level test for `MobilePatrolPage` rendering key labels and disabled/enabled actions.
- Update existing mobile Open Design tests only as needed so patrol no longer depends on iframe task injection.
- Keep `npm run check:app-parity` passing, updating checks to allow patrol React ownership.

Manual and device verification:

- Build/sync/reinstall APK after implementation.
- Launch on the real Android phone.
- Compare current patrol tab screenshot against the React patrol tab screenshot.
- Verify cloud create -> task appears pending.
- Verify bridge status updates change the queue/timeline.
- Verify gateway/car-direct create sends `auto_start` and stop sends `auto_stop`.

## Documentation Updates

Update `docs/mobile-opendesign-handoff.md` to state:

- Overview/control/data/manage remain on the current Open Design iframe path for now.
- Patrol is React-owned and must visually replicate the current APK patrol tab.
- Future migrations should move one tab at a time and keep side-by-side visual verification.

## Acceptance Criteria

- APK patrol tab is rendered by React, not by Open Design iframe task DOM replacement.
- The visible patrol page matches the current APK patrol tab layout and styling.
- Patrol actions use direct React handlers and real application state.
- Cloud mode creates real patrol tasks and reflects real task lifecycle states.
- Gateway and car-direct modes are clearly local execution records, not fake cloud tasks.
- No fake step-level progress is introduced.
- Existing non-patrol mobile tabs remain usable.
- Focused tests pass.
- Real-phone APK launch and patrol-page visual verification are completed.
