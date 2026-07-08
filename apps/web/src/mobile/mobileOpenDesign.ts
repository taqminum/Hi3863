import type {
  AgentReport,
  AuditLog,
  BaseStationRecord,
  ControlCommand,
  DeviceRecord,
  PatrolTask,
  Reading,
  User
} from "../api";
import { connectionModeLabel } from "../connectionModes.ts";
import { buildTimeSeries } from "../historySeries.ts";
import type { ConnectionMode } from "../types";

export type MobileOpenDesignTab = "overview" | "control" | "tasks" | "data" | "manage";
export type MobileHistoryRange = "1H" | "24H" | "7D";

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
  connectionMode: ConnectionMode;
  historyRange: MobileHistoryRange;
  seriesLabels: string[];
  series: {
    rssi: Array<number | null>;
    temperature: Array<number | null>;
    humidity: Array<number | null>;
    lightness: Array<number | null>;
  };
}

export type MobileOpenDesignToHostMessage =
  | { source: "ws63-mobile-open-design"; type: "ready" }
  | { source: "ws63-mobile-open-design"; type: "active-tab"; tab: MobileOpenDesignTab }
  | { source: "ws63-mobile-open-design"; type: "drive"; left: number; right: number; speed: number; durationMs: number }
  | { source: "ws63-mobile-open-design"; type: "stop" }
  | { source: "ws63-mobile-open-design"; type: "connection-mode"; mode: ConnectionMode }
  | { source: "ws63-mobile-open-design"; type: "history-range"; range: MobileHistoryRange }
  | { source: "ws63-mobile-open-design"; type: "create-patrol"; template: "standard" }
  | { source: "ws63-mobile-open-design"; type: "refresh-agent" }
  | { source: "ws63-mobile-open-design"; type: "logout" };

export interface HostToMobileOpenDesignMessage {
  source: "ws63-mobile-host";
  type: "snapshot";
  payload: MobileOpenDesignSnapshot;
}

export interface MobileOpenDesignSnapshotInput {
  user: User;
  connectionMode: ConnectionMode;
  selectedDevice?: DeviceRecord;
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  readings: Reading[];
  commands: ControlCommand[];
  tasks: PatrolTask[];
  reports: AgentReport[];
  audits: AuditLog[];
  notice: string;
  historyRange: MobileHistoryRange;
}

const landscapePatch = `<style id="ws63-mobile-landscape-patch">
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
body {
  background: #000;
  --ws63-system-right-reserve: clamp(72px, env(safe-area-inset-right, 96px), 128px);
  justify-content: flex-start !important;
  align-items: stretch !important;
  padding-right: var(--ws63-system-right-reserve) !important;
}
.device-container {
  width: calc(100vw - var(--ws63-system-right-reserve)) !important;
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
body[data-active-view="view-control"] .speed-value-display {
  transform: translateY(-12px);
}
.ws63-connection-switch {
  position: absolute;
  top: 10px;
  left: 96px;
  z-index: 180;
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(8, 12, 18, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.ws63-connection-switch button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8E9BAE;
  font: 600 11px system-ui, sans-serif;
}
.ws63-connection-switch button.active {
  color: #fff;
  background: rgba(0, 194, 255, 0.22);
}
</style>`;

const touchIsolationScript = `<script id="ws63-mobile-touch-isolation">
(() => {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const activeTouchIds = { joystick: null, speed: null };
  const windowListenerCounts = { touchmove: 0, touchend: 0 };

  function roleForNode(node) {
    if (!node || !node.closest) return null;
    if (node.closest("#joystick-base")) return "joystick";
    if (node.closest("#speed-slider")) return "speed";
    return null;
  }

  function roleForPoint(point) {
    if (!point) return null;
    const element = document.elementFromPoint(point.clientX, point.clientY);
    return roleForNode(element);
  }

  function activeIdForRole(role) {
    return role === "joystick" ? activeTouchIds.joystick : activeTouchIds.speed;
  }

  function setActiveId(role, id) {
    if (role === "joystick") activeTouchIds.joystick = id;
    if (role === "speed") activeTouchIds.speed = id;
  }

  function touchListToArray(list) {
    return Array.from(list || []);
  }

  function touchForRole(event, role) {
    const touches = touchListToArray(event.touches);
    const changedTouches = touchListToArray(event.changedTouches);
    const activeId = activeIdForRole(role);
    if (activeId !== null && activeId !== undefined) {
      return touches.find((touch) => touch.identifier === activeId)
        || changedTouches.find((touch) => touch.identifier === activeId)
        || null;
    }
    const candidates = changedTouches.length > 0 ? changedTouches : touches;
    return candidates.find((touch) => roleForPoint(touch) === role) || null;
  }

  function eventForTouch(event, touch) {
    if (!touch) return null;
    const isolated = Object.create(event);
    Object.defineProperty(isolated, "touches", { configurable: true, value: [touch] });
    Object.defineProperty(isolated, "targetTouches", { configurable: true, value: [touch] });
    Object.defineProperty(isolated, "changedTouches", { configurable: true, value: [touch] });
    isolated.preventDefault = event.preventDefault.bind(event);
    isolated.stopPropagation = event.stopPropagation.bind(event);
    isolated.stopImmediatePropagation = event.stopImmediatePropagation.bind(event);
    return isolated;
  }

  function roleForWindowTouchListener(type) {
    if (type !== "touchmove" && type !== "touchend") return null;
    windowListenerCounts[type] += 1;
    if (windowListenerCounts[type] === 1) return "joystick";
    if (windowListenerCounts[type] === 2) return "speed";
    return null;
  }

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (typeof listener !== "function") {
      return originalAddEventListener.call(this, type, listener, options);
    }

    const targetRole = type === "touchstart" ? roleForNode(this) : null;
    const windowRole = this === window ? roleForWindowTouchListener(type) : null;
    const role = targetRole || windowRole;

    if (!role) {
      return originalAddEventListener.call(this, type, listener, options);
    }

    const wrapped = function(event) {
      if (type === "touchstart") {
        const touch = touchForRole(event, role);
        if (!touch) return;
        setActiveId(role, touch.identifier);
        return listener.call(this, eventForTouch(event, touch));
      }

      if (type === "touchmove") {
        const touch = touchForRole(event, role);
        if (!touch) return;
        return listener.call(this, eventForTouch(event, touch));
      }

      if (type === "touchend") {
        const activeId = activeIdForRole(role);
        const ended = touchListToArray(event.changedTouches).some((touch) => touch.identifier === activeId);
        if (!ended) return;
        setActiveId(role, null);
        return listener.call(this, event);
      }

      return listener.call(this, event);
    };

    return originalAddEventListener.call(this, type, wrapped, options);
  };

  window.__ws63TouchIsolation = {
    pick(event, role) {
      return touchForRole(event, role);
    }
  };
})();
</script>`;

const bridgeScript = `<script id="ws63-mobile-host-bridge">
(() => {
  const SOURCE = "ws63-mobile-open-design";
  const HOST = "ws63-mobile-host";
  let lastDriveAt = 0;
  let currentSpeed = 0.8;
  let driveTimer = 0;
  let latestDrivePayload = null;

  function send(type, payload) {
    window.parent.postMessage({ source: SOURCE, type, ...(payload || {}) }, "*");
  }

  function text(selector, value) {
    const node = document.querySelector(selector);
    if (node && value !== undefined && value !== null) node.textContent = String(value);
  }

  function patchByText(label, value) {
    const nodes = Array.from(document.querySelectorAll(".metric-value, .stat-value, .ov-value, .panel-value"));
    const target = nodes.find((node) => node.textContent && node.textContent.includes(label));
    if (target && value !== undefined && value !== null) target.textContent = String(value);
  }

  function setMetric(index, value) {
    const node = document.querySelectorAll(".ov-data-value")[index];
    if (node && value !== undefined && value !== null) node.textContent = String(value);
  }

  function updateChart(canvasId, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart || !Array.isArray(values)) return;
    const chart = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
    if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) return;
    chart.data.labels = Array.isArray(window.__ws63SeriesLabels) ? window.__ws63SeriesLabels : values.map((_, index) => String(index + 1));
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].spanGaps = false;
    chart.options.spanGaps = false;
    chart.update("none");
  }

  function ensureConnectionSwitch() {
    if (document.getElementById("ws63-connection-switch")) return;
    const root = document.querySelector(".device-container") || document.body;
    const switcher = document.createElement("div");
    switcher.id = "ws63-connection-switch";
    switcher.className = "ws63-connection-switch";
    switcher.innerHTML = [
      '<button id="ws63-mode-cloud" data-mode="cloud">云端</button>',
      '<button id="ws63-mode-gateway" data-mode="gateway">基站</button>',
      '<button id="ws63-mode-car-direct" data-mode="car-direct">小车</button>'
    ].join("");
    switcher.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        send("connection-mode", { mode });
      });
    });
    root.appendChild(switcher);
  }

  function updateConnectionSwitch(mode) {
    ensureConnectionSwitch();
    document.querySelectorAll("#ws63-connection-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
  }

  function updateHistoryRange(range) {
    document.querySelectorAll("#data-time-toggles .time-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.range === range);
    });
  }

  function attachHistoryRangeBridge() {
    document.querySelectorAll("#data-time-toggles .time-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const range = button.dataset.range || "1H";
        updateHistoryRange(range);
        send("history-range", { range });
      }, true);
    });
  }

  function setActiveView(target) {
    if (!target) return;
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

  function readSpeed() {
    const raw = document.getElementById("speed-val")?.textContent || "";
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) currentSpeed = parsed;
    return currentSpeed;
  }

  function emitDriveFromPointer(event, force) {
    const base = document.getElementById("joystick-base");
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const point = event.touches ? (window.__ws63TouchIsolation?.pick(event, "joystick") || event.touches[0]) : event;
    if (!point) return;
    const dx = point.clientX - rect.left - rect.width / 2;
    const dy = point.clientY - rect.top - rect.height / 2;
    const radius = 40;
    const x = Math.max(-1, Math.min(1, dx / radius));
    const y = Math.max(-1, Math.min(1, -dy / radius));
    const left = Math.max(-100, Math.min(100, Math.round((y + x) * 70)));
    const right = Math.max(-100, Math.min(100, Math.round((y - x) * 70)));
    if (Math.hypot(x, y) < 0.16) {
      stopDrive();
      return;
    }
    startDrive({ left, right, speed: readSpeed(), durationMs: 350 }, force);
  }

  function repeatDrive(force) {
    if (!latestDrivePayload) return;
    const now = Date.now();
    if (!force && now - lastDriveAt < 280) return;
    lastDriveAt = now;
    send("drive", latestDrivePayload);
  }

  function startDrive(payload, force) {
    latestDrivePayload = payload;
    repeatDrive(Boolean(force));
    if (!driveTimer) {
      driveTimer = window.setInterval(() => repeatDrive(false), 300);
    }
  }

  function stopDrive() {
    latestDrivePayload = null;
    if (driveTimer) {
      window.clearInterval(driveTimer);
      driveTimer = 0;
    }
    send("stop");
  }

  function attachControlBridge() {
    const joystickBase = document.getElementById("joystick-base");
    if (joystickBase) {
      joystickBase.addEventListener("mousedown", (event) => emitDriveFromPointer(event, true));
      joystickBase.addEventListener("mousemove", (event) => emitDriveFromPointer(event, false));
      joystickBase.addEventListener("touchstart", (event) => emitDriveFromPointer(event, true), { passive: true });
      joystickBase.addEventListener("touchmove", (event) => emitDriveFromPointer(event, false), { passive: true });
      window.addEventListener("mouseup", stopDrive);
      window.addEventListener("touchend", stopDrive);
      window.addEventListener("blur", stopDrive);
    }
    document.getElementById("speed-slider")?.addEventListener("touchend", readSpeed);
    document.getElementById("speed-slider")?.addEventListener("mouseup", readSpeed);
    document.querySelector(".btn-primary")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      send("create-patrol", { template: "standard" });
    }, true);
    document.querySelector(".agent-card")?.addEventListener("click", () => send("refresh-agent"));
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    window.__ws63SeriesLabels = snapshot.seriesLabels;
    updateConnectionSwitch(snapshot.connectionMode);
    updateHistoryRange(snapshot.historyRange);
    text("[data-od-id='app-title']", "WS63E 控制台");
    patchByText("dBm", snapshot.rssiLabel);
    patchByText("°C", snapshot.temperatureLabel);
    patchByText("%RH", snapshot.humidityLabel);
    patchByText("lx", snapshot.lightnessLabel);
    setMetric(0, snapshot.rssiLabel);
    setMetric(1, snapshot.temperatureLabel);
    setMetric(2, snapshot.humidityLabel);
    setMetric(3, snapshot.lightnessLabel);
    const statusValues = document.querySelectorAll(".status-val");
    if (statusValues[0]) statusValues[0].textContent = snapshot.deviceName;
    if (statusValues[1]) statusValues[1].textContent = snapshot.baseStationName + " " + snapshot.baseStationStatus;
    if (statusValues[2]) statusValues[2].textContent = snapshot.rssiLabel;
    const agentDesc = document.querySelector(".agent-desc");
    if (agentDesc) agentDesc.textContent = snapshot.agentSummary;
    updateChart("ov-chart-signal", snapshot.series.rssi);
    updateChart("ov-chart-temp", snapshot.series.temperature);
    updateChart("ov-chart-humid", snapshot.series.humidity);
    updateChart("ov-chart-light", snapshot.series.lightness);
    updateChart("dt-chart-temp", snapshot.series.temperature);
    updateChart("dt-chart-humid", snapshot.series.humidity);
    updateChart("dt-chart-light", snapshot.series.lightness);
    window.__ws63MobileSnapshot = snapshot;
  }

  window.addEventListener("load", () => {
    setActiveView("view-overview");
    ensureConnectionSwitch();
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => setActiveView(item.dataset.target));
    });
    attachControlBridge();
    attachHistoryRangeBridge();
    send("ready");
  });

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.source !== HOST || message.type !== "snapshot") return;
    applySnapshot(message.payload);
  });
})();
</script>`;

function injectBeforeCloseTag(html: string, closeTag: string, snippet: string): string {
  const index = html.toLowerCase().lastIndexOf(closeTag);
  if (index === -1) return `${html}${snippet}`;
  return `${html.slice(0, index)}${snippet}${html.slice(index)}`;
}

function injectBeforeOpenDesignScript(html: string, scriptTag: string, snippet: string): string {
  const index = html.indexOf(scriptTag);
  if (index === -1) return injectBeforeCloseTag(html, "</head>", snippet);
  return `${html.slice(0, index)}${snippet}${html.slice(index)}`;
}

export function buildMobileOpenDesignSrcDoc(html: string): string {
  const withPatch = html.includes("ws63-mobile-landscape-patch")
    ? html
    : injectBeforeCloseTag(html, "</head>", landscapePatch);
  const withTouchIsolation = withPatch.includes("ws63-mobile-touch-isolation")
    ? withPatch
    : injectBeforeOpenDesignScript(withPatch, "<script src=\"https://unpkg.com/lucide@latest\"></script>", touchIsolationScript);
  return withTouchIsolation.includes("ws63-mobile-host-bridge")
    ? withTouchIsolation
    : injectBeforeCloseTag(withTouchIsolation, "</body>", bridgeScript);
}

function formatNumber(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "--";
}

function statusLabel(value?: string): string {
  if (value === "online" || value === "cloud-online") return "在线";
  if (value === "offline") return "离线";
  return value || "未知";
}

function roleLabel(role: User["role"]): string {
  return role === "admin" ? "管理员" : role === "operator" ? "操作员" : "观察员";
}

function normalizeAgentReport(report?: AgentReport): { summary: string } {
  return {
    summary: report?.summary ?? "等待 Agent 分析结果"
  };
}

function rangeDurationMs(range: MobileHistoryRange): number {
  if (range === "7D") return 7 * 24 * 60 * 60 * 1000;
  if (range === "24H") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function rangeBucketMs(range: MobileHistoryRange): number {
  if (range === "7D") return 6 * 60 * 60 * 1000;
  if (range === "24H") return 60 * 60 * 1000;
  return 150_000;
}

function snapshotRange(readings: Reading[], range: MobileHistoryRange): { from: string; to: string; bucketMs: number } {
  const bucketMs = rangeBucketMs(range);
  const latest = readings
    .map((reading) => Date.parse(reading.recordedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .at(-1);
  const now = Date.now();
  const durationMs = rangeDurationMs(range);
  const end = latest && now - latest < durationMs ? now : (latest ?? now) + bucketMs;
  return {
    from: new Date(end - durationMs).toISOString(),
    to: new Date(end).toISOString(),
    bucketMs
  };
}

function snapshotSeries(readings: Reading[], field: "rssi" | "temperature" | "humidity" | "lightness", historyRange: MobileHistoryRange) {
  const range = snapshotRange(readings, historyRange);
  return buildTimeSeries({
    readings,
    field,
    from: range.from,
    to: range.to,
    bucketMs: range.bucketMs
  });
}

export function buildMobileOpenDesignSnapshot(input: MobileOpenDesignSnapshotInput): MobileOpenDesignSnapshot {
  const latest = input.readings.at(-1);
  const base = input.baseStations.find((item) => item.id === input.selectedDevice?.base_station_id) ?? input.baseStations[0];
  const report = normalizeAgentReport(input.reports[0]);
  const command = input.commands[0];
  const task = input.tasks[0];
  const rssi = latest?.rssi ?? base?.last_rssi;
  const cachedCount = latest?.cachedCount ?? base?.cached_count ?? 0;
  const temperatureSeries = snapshotSeries(input.readings, "temperature", input.historyRange);
  const humiditySeries = snapshotSeries(input.readings, "humidity", input.historyRange);
  const lightnessSeries = snapshotSeries(input.readings, "lightness", input.historyRange);
  const rssiSeries = snapshotSeries(input.readings, "rssi", input.historyRange);

  return {
    userLabel: input.user.displayName || input.user.username,
    roleLabel: roleLabel(input.user.role),
    connectionModeLabel: connectionModeLabel(input.connectionMode),
    deviceName: input.selectedDevice?.name || "WS63E-巡检车-01",
    deviceStatus: statusLabel(input.selectedDevice?.status),
    baseStationName: base?.name || "SLE 基站",
    baseStationStatus: statusLabel(base?.status ?? base?.network_status),
    rssiLabel: Number.isFinite(rssi) ? `${rssi} dBm` : "-- dBm",
    cachedCountLabel: `${cachedCount} 条`,
    temperatureLabel: `${formatNumber(latest?.temperature)}°C`,
    humidityLabel: `${formatNumber(latest?.humidity, 0)}%RH`,
    lightnessLabel: `${formatNumber(latest?.lightness, 0)} lx`,
    commandStatus: command ? `${command.payload} / ${command.status}` : "--",
    taskStatus: task ? `${task.name} / ${task.status}` : "--",
    agentSummary: report.summary,
    notice: input.notice,
    connectionMode: input.connectionMode,
    historyRange: input.historyRange,
    seriesLabels: temperatureSeries.map((point) => point.label),
    series: {
      rssi: rssiSeries.map((point) => point.value),
      temperature: temperatureSeries.map((point) => point.value),
      humidity: humiditySeries.map((point) => point.value),
      lightness: lightnessSeries.map((point) => point.value)
    }
  };
}
