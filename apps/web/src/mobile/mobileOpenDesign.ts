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
import {
  bucketMsForGranularity,
  buildTimeSeries,
  durationMsForGranularity,
  sampleReadingsByInterval,
  type SeriesGranularity
} from "../historySeries.ts";
import type { ConnectionMode } from "../types";

export type MobileOpenDesignTab = "overview" | "control" | "tasks" | "data" | "manage";
export type MobileHistoryRange = "1H" | "24H" | "7D";
export type MobileTopologyStatus = "online" | "warning" | "offline";

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
  taskCards: MobileTaskCard[];
  taskTimeline: MobileTaskTimelineItem[];
  agentSummary: string;
  notice: string;
  cloudServerStatus: MobileTopologyStatus;
  baseStationNodeStatus: MobileTopologyStatus;
  deviceNodeStatus: MobileTopologyStatus;
  cloudServerDetail: string;
  baseStationDetail: string;
  deviceDetail: string;
  baseStationAgeLabel: string;
  deviceAgeLabel: string;
  telemetryStatus: "live" | "stale" | "empty";
  telemetryDetail: string;
  activeTransportStatus: MobileTopologyStatus;
  activeTransportLabel: string;
  activeTransportDetail: string;
  wifiSignalLabel: string;
  wifiSpeedLabel: string;
  riskLevel: "low" | "medium" | "high";
  riskSummary: string;
  riskSuggestions: string[];
  riskEvidence: string[];
  connectionMode: ConnectionMode;
  historyRange: MobileHistoryRange;
  seriesLabels: string[];
  series: {
    rssi: Array<number | null>;
    temperature: Array<number | null>;
    humidity: Array<number | null>;
    lightness: Array<number | null>;
  };
  detailSeries: Record<SeriesGranularity, {
    labels: string[];
    rssi: Array<number | null>;
    temperature: Array<number | null>;
    humidity: Array<number | null>;
    lightness: Array<number | null>;
  }>;
}

export interface MobileTaskCard {
  id: string;
  name: string;
  status: PatrolTask["status"];
  statusLabel: string;
  detail: string;
  timeLabel: string;
  baseStationId: string;
}

export interface MobileTaskTimelineItem {
  title: string;
  meta: string;
  state: "done" | "active" | "error" | "idle";
}

export type MobileOpenDesignToHostMessage =
  | { source: "ws63-mobile-open-design"; type: "ready" }
  | { source: "ws63-mobile-open-design"; type: "active-tab"; tab: MobileOpenDesignTab }
  | { source: "ws63-mobile-open-design"; type: "drive"; left: number; right: number; speed: number; durationMs: number }
  | { source: "ws63-mobile-open-design"; type: "stop" }
  | { source: "ws63-mobile-open-design"; type: "connection-mode"; mode: ConnectionMode }
  | { source: "ws63-mobile-open-design"; type: "connect-network" }
  | { source: "ws63-mobile-open-design"; type: "history-range"; range: MobileHistoryRange }
  | { source: "ws63-mobile-open-design"; type: "create-patrol"; template: "closed-loop" | "return-lane" }
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
  realtimeReading?: Reading | null;
  previousRealtimeReading?: Reading | null;
  cloudApiOnline?: boolean;
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
  background: var(--bg-app) !important;
}
.side-nav {
  flex: 0 0 80px !important;
  position: relative !important;
  z-index: 100 !important;
}
#view-overview.active {
  display: grid !important;
  grid-template-rows: minmax(108px, 0.68fr) auto !important;
  align-content: start !important;
  gap: 12px !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  padding-top: 14px !important;
  padding-bottom: 12px !important;
}
body[data-active-view="view-overview"] .content-area {
  overflow: hidden !important;
}
#view-overview .dash-top-row {
  min-height: 0 !important;
  margin-bottom: 0 !important;
  gap: 12px !important;
}
#view-overview .topology-card,
#view-overview .risk-card {
  min-height: 0 !important;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}
#view-overview .data-grid {
  height: clamp(148px, 29vh, 176px) !important;
  min-height: 0 !important;
  gap: 12px !important;
  align-self: start !important;
}
#view-overview .ov-data-card {
  min-height: 0 !important;
  padding: 10px !important;
  border-radius: 12px !important;
}
#view-overview .ov-data-card.ws63-card-normalized {
  border-color: var(--border-color) !important;
  background: var(--bg-surface) !important;
}
#view-overview .ov-data-card.ws63-card-normalized .ov-data-value,
#view-overview .ov-data-card.ws63-card-normalized .ov-data-header i {
  color: var(--fg-primary) !important;
}
#view-overview .data-top-row-card {
  gap: 8px !important;
}
#view-overview .ov-data-header {
  gap: 6px !important;
}
#view-overview .ov-data-label {
  font-size: 12px !important;
  line-height: 1.25 !important;
}
#view-overview .ov-data-value {
  font-size: clamp(20px, 2.6vw, 28px) !important;
  line-height: 1.05 !important;
}
#view-overview .ov-data-unit {
  font-size: 16px !important;
}
#view-overview .ov-chart-container {
  flex: 1 1 auto !important;
  min-height: 58px !important;
  height: 68px !important;
  margin-top: 4px !important;
}
.view-section.active:not(#view-overview):not(#view-control) {
  min-height: 100% !important;
}
body[data-active-view="view-tasks"] .content-area {
  overflow: hidden !important;
}
body[data-active-view="view-tasks"] #view-tasks {
  height: 100% !important;
  overflow: hidden !important;
}
body[data-active-view="view-tasks"] #view-tasks .tasks-layout {
  display: grid !important;
  grid-template-columns: minmax(190px, 0.72fr) minmax(0, 1fr) !important;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) !important;
  gap: 10px !important;
  height: 100% !important;
  min-height: 0 !important;
}
body[data-active-view="view-tasks"] #view-tasks .task-panel {
  min-height: 0 !important;
}
body[data-active-view="view-tasks"] #view-tasks .task-panel:nth-child(1) {
  grid-column: 1 !important;
  grid-row: 1 / 3 !important;
}
body[data-active-view="view-tasks"] #view-tasks .task-panel:nth-child(2) {
  grid-column: 2 !important;
  grid-row: 1 !important;
}
body[data-active-view="view-tasks"] #view-tasks .task-panel:nth-child(3) {
  grid-column: 2 !important;
  grid-row: 2 !important;
}
body[data-active-view="view-tasks"] #view-tasks .panel-body,
body[data-active-view="view-tasks"] #view-tasks .queue-list,
body[data-active-view="view-tasks"] #view-tasks .timeline {
  min-height: 0 !important;
  overflow: auto !important;
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
body[data-active-view="view-control"] .speed-label {
  transform: translateY(12px);
  z-index: 2;
  white-space: nowrap;
}
.ws63-connection-switch {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 180;
  display: grid;
  grid-template-columns: repeat(3, minmax(48px, 1fr));
  width: min(230px, calc(100vw - 240px));
  min-width: 168px;
  gap: 4px;
  padding: 5px;
  border-radius: 999px;
  background: rgba(8, 12, 18, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(10px);
}
.ws63-connection-switch button {
  height: 32px;
  min-width: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #8E9BAE;
  font: 700 12px system-ui, sans-serif;
  text-align: center;
  white-space: nowrap;
  touch-action: manipulation;
}
.ws63-connection-switch button.active {
  color: #fff;
  background: rgba(0, 194, 255, 0.22);
}
.cloud-status.ws63-status-online {
  color: var(--color-cyan) !important;
  background: rgba(0, 230, 168, 0.1) !important;
  border-color: rgba(0, 230, 168, 0.28) !important;
}
.cloud-status.ws63-status-warning {
  color: var(--color-amber) !important;
  background: rgba(255, 176, 32, 0.1) !important;
  border-color: rgba(255, 176, 32, 0.32) !important;
}
.cloud-status.ws63-status-offline {
  color: var(--color-red) !important;
  background: rgba(255, 77, 79, 0.1) !important;
  border-color: rgba(255, 77, 79, 0.32) !important;
}
.cloud-status {
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cloud-status.ws63-status-warning .status-dot { background-color: var(--color-amber) !important; box-shadow: 0 0 6px var(--color-amber) !important; }
.cloud-status.ws63-status-offline .status-dot { background-color: var(--color-red) !important; box-shadow: 0 0 6px var(--color-red) !important; }
.topology-card .node.ws63-node-offline .node-icon {
  color: var(--fg-tertiary) !important;
  border-color: var(--border-color) !important;
}
.topology-card .node.ws63-node-warning .node-icon {
  color: var(--color-amber) !important;
  border-color: rgba(255, 176, 32, 0.45) !important;
}
.topology-card {
  cursor: pointer;
  touch-action: manipulation;
}
.topology-card .node.ws63-node-hidden,
.topology-card .link-line.ws63-link-hidden,
.topology-card .link-label.ws63-link-hidden {
  display: none !important;
}
.topology-card.ws63-topology-compact {
  justify-content: center !important;
  gap: 28px !important;
}
.topology-card .link-line.ws63-link-offline { background: var(--border-color) !important; box-shadow: none !important; }
.topology-card .link-line.ws63-link-warning { background: var(--color-amber) !important; box-shadow: none !important; }
.risk-card {
  max-height: 100% !important;
  overflow-y: auto !important;
  scrollbar-width: thin;
  cursor: pointer;
  touch-action: manipulation;
}
.risk-card.ws63-risk-low { border-left-color: var(--color-cyan) !important; }
.risk-card.ws63-risk-medium { border-left-color: var(--color-amber) !important; }
.risk-card.ws63-risk-high { border-left-color: var(--color-red) !important; }
.risk-card .ws63-risk-list {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 10px;
  color: var(--fg-secondary);
  line-height: 1.45;
}
.ws63-detail-granularity {
  display: flex;
  gap: 4px;
  margin-left: 10px;
}
.ws63-detail-granularity button {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--fg-secondary);
  font: 600 10px system-ui, sans-serif;
  padding: 3px 8px;
}
.ws63-detail-granularity button.active {
  color: #fff;
  background: rgba(0, 194, 255, 0.24);
  border-color: rgba(0, 194, 255, 0.36);
}
.ws63-chart-readout {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  color: var(--fg-secondary);
  font: 600 10px system-ui, sans-serif;
}
.sys-status .theme-btn,
.sys-status .ws63-wifi-action {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  border-radius: 50% !important;
  border: 1px solid var(--border-color) !important;
  background: var(--bg-surface) !important;
  color: var(--fg-secondary) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  cursor: pointer;
  touch-action: manipulation;
}
.sys-status .theme-btn:active,
.sys-status .ws63-wifi-action:active {
  transform: scale(0.94);
}
.ws63-wifi-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ws63-wifi-meta {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  color: var(--fg-tertiary);
  font: 700 9px var(--font-mono), monospace;
  line-height: 1.05;
  min-width: 34px;
}
.ws63-info-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
}
.ws63-info-modal.active { display: flex; }
.ws63-info-panel {
  width: min(520px, calc(100vw - 220px));
  max-height: calc(100vh - 92px);
  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: #161A1F;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
  padding: 18px;
}
body.light-theme .ws63-info-panel {
  background: #FFFFFF;
}
.ws63-info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ws63-info-head h3 {
  margin: 0;
  color: var(--fg-primary);
  font-size: 16px;
}
.ws63-info-close {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--fg-secondary);
}
.ws63-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ws63-info-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-surface);
}
.ws63-info-label {
  color: var(--fg-tertiary);
  font-size: 10px;
  margin-bottom: 4px;
}
.ws63-info-value {
  color: var(--fg-primary);
  font: 700 12px system-ui, sans-serif;
}
.ws63-info-section {
  margin-top: 12px;
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.ws63-info-section ul {
  margin: 6px 0 0;
  padding-left: 18px;
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
  const DRIVE_REPEAT_MS = 1000;
  let lastDriveAt = 0;
  let currentSpeed = 0.8;
  let driveTimer = 0;
  let latestDrivePayload = null;
  let detailGranularity = "second";
  let activeDetailKey = null;

  function send(type, payload) {
    window.parent.postMessage({ source: SOURCE, type, ...(payload || {}) }, "*");
  }

  function text(selector, value) {
    const node = document.querySelector(selector);
    if (node && value !== undefined && value !== null) node.textContent = String(value);
  }

  function html(selector, value) {
    const node = document.querySelector(selector);
    if (node && value !== undefined && value !== null) node.innerHTML = String(value);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureInfoModal() {
    let modal = document.getElementById("ws63-info-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "ws63-info-modal";
    modal.className = "ws63-info-modal";
    modal.innerHTML = [
      '<div class="ws63-info-panel">',
      '<div class="ws63-info-head"><h3 id="ws63-info-title"></h3><button class="ws63-info-close" type="button">×</button></div>',
      '<div id="ws63-info-body"></div>',
      '</div>'
    ].join("");
    modal.querySelector(".ws63-info-close")?.addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("active");
    });
    document.body.appendChild(modal);
    return modal;
  }

  function showInfoModal(title, bodyHtml) {
    const modal = ensureInfoModal();
    const titleNode = modal.querySelector("#ws63-info-title");
    const bodyNode = modal.querySelector("#ws63-info-body");
    if (titleNode) titleNode.textContent = title;
    if (bodyNode) bodyNode.innerHTML = bodyHtml;
    modal.classList.add("active");
  }

  function infoGrid(items) {
    return '<div class="ws63-info-grid">' + items.map(([label, value]) =>
      '<div class="ws63-info-item"><div class="ws63-info-label">' + escapeHtml(label) + '</div><div class="ws63-info-value">' + escapeHtml(value || "--") + '</div></div>'
    ).join("") + '</div>';
  }

  function listHtml(items) {
    const normalized = (items || []).filter(Boolean);
    if (!normalized.length) return '<div class="ws63-info-section">暂无更多明细。</div>';
    return '<ul>' + normalized.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>';
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

  function setDataMetric(cardClass, value) {
    const text = String(value || "--");
    const number = text.match(/-?\\d+(?:\\.\\d+)?/)?.[0] || "--";
    const node = document.querySelector("." + cardClass + " .m-val");
    if (node) node.textContent = number;
  }

  function drawFallbackLine(canvas, values) {
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx || !Array.isArray(values) || values.length === 0) return;
    const width = canvas.width || canvas.clientWidth || 160;
    const height = canvas.height || canvas.clientHeight || 48;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2;
    ctx.strokeStyle = canvas.id.includes("light") ? "#FFC107" : "#00E6A8";
    ctx.stroke();
  }

  function fitChartScale(chart, values) {
    if (!chart?.options?.scales?.y || !Array.isArray(values) || values.length === 0) return;
    const finiteValues = values.filter((value) => Number.isFinite(value));
    if (finiteValues.length === 0) return;
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    const span = Math.max(1, max - min);
    const padding = Math.max(span * 0.18, Math.abs(max || min) * 0.04, 1);
    chart.options.scales.y.min = Math.floor(min - padding);
    chart.options.scales.y.max = Math.ceil(max + padding);
  }

  function updateChart(canvasId, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(values)) return;
    const chart = window.Chart?.getChart ? window.Chart.getChart(canvas) : null;
    if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) {
      drawFallbackLine(canvas, values.filter((value) => Number.isFinite(value)));
      return;
    }
    chart.data.labels = Array.isArray(window.__ws63SeriesLabels) ? window.__ws63SeriesLabels : values.map((_, index) => String(index + 1));
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].spanGaps = false;
    chart.options.spanGaps = false;
    fitChartScale(chart, values);
    chart.update("none");
  }

  function snapshotSeriesForKey(key) {
    const snapshot = window.__ws63MobileSnapshot;
    if (!snapshot?.series) return null;
    if (key === "signal") return snapshot.series.rssi;
    if (key === "temp") return snapshot.series.temperature;
    if (key === "humid") return snapshot.series.humidity;
    if (key === "light") return snapshot.series.lightness;
    return null;
  }

  function detailSeriesForKey(key) {
    const snapshot = window.__ws63MobileSnapshot;
    const group = snapshot?.detailSeries?.[detailGranularity];
    if (!group) return null;
    if (key === "signal") return group.rssi;
    if (key === "temp") return group.temperature;
    if (key === "humid") return group.humidity;
    if (key === "light") return group.lightness;
    return null;
  }

  function labelsForDetail() {
    const snapshot = window.__ws63MobileSnapshot;
    return snapshot?.detailSeries?.[detailGranularity]?.labels || snapshot?.seriesLabels || [];
  }

  function connectLineSeries(values) {
    const connected = [...values];
    let previousIndex = -1;
    values.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      if (previousIndex >= 0 && index - previousIndex > 1) {
        const previousValue = values[previousIndex];
        const step = (value - previousValue) / (index - previousIndex);
        for (let cursor = previousIndex + 1; cursor < index; cursor += 1) {
          connected[cursor] = previousValue + step * (cursor - previousIndex);
        }
      }
      previousIndex = index;
    });
    return connected;
  }

  function granularityLabel(value) {
    if (value === "minute") return "1m";
    if (value === "hour") return "1h";
    if (value === "day") return "1d";
    return "1s";
  }

  function ensureDetailGranularityControls(titleNode, key) {
    titleNode.querySelector(".ws63-detail-granularity")?.remove();
    titleNode.querySelector(".ws63-chart-readout")?.remove();
    const controls = document.createElement("span");
    controls.className = "ws63-detail-granularity";
    [
      ["second", "1s"],
      ["minute", "1m"],
      ["hour", "1h"],
      ["day", "1d"]
    ].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.granularity = value;
      button.textContent = label;
      button.classList.toggle("active", detailGranularity === value);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        detailGranularity = value;
        activeDetailKey = key;
        openLiveChartModal(key);
      });
      controls.appendChild(button);
    });
    titleNode.appendChild(controls);
  }

  function setChartReadout(titleNode, label, value, unit) {
    titleNode.querySelector(".ws63-chart-readout")?.remove();
    const readout = document.createElement("span");
    readout.className = "ws63-chart-readout";
    readout.textContent = value === null || value === undefined ? label + " --" : label + " " + value + " " + unit;
    titleNode.appendChild(readout);
  }

  function openLiveChartModal(key) {
    const originalStore = {
      signal: { title: "SLE 信号质量", unit: "dBm", icon: "activity", type: "bar", color: "#00E6A8", bgColor: "rgba(0, 230, 168, 0.8)" },
      temp: { title: "环境温度", unit: "°C", icon: "thermometer", type: "line", color: "#FF9800", bgColor: "rgba(255, 152, 0, 0.2)" },
      humid: { title: "环境湿度", unit: "%RH", icon: "droplets", type: "line", color: "#FFB020", bgColor: "rgba(255, 176, 32, 0.3)" },
      light: { title: "环境光照", unit: "lx", icon: "sun", type: "line", color: "#FFC107", bgColor: "rgba(255, 193, 7, 0.2)" }
    };
    const config = originalStore[key];
    const rawValues = detailSeriesForKey(key) || snapshotSeriesForKey(key);
    if (!config || !Array.isArray(rawValues) || !window.Chart) {
      return window.__ws63OriginalOpenChartModal?.(key);
    }
    const rawLabels = labelsForDetail().length > 0 ? labelsForDetail() : rawValues.map((_, index) => String(index + 1));
    const values = config.type === "line" ? connectLineSeries(rawValues) : rawValues;

    const modal = document.getElementById("chart-modal");
    const title = document.getElementById("modal-title");
    const canvas = document.getElementById("detailed-chart");
    const ctx = canvas?.getContext && canvas.getContext("2d");
    if (!modal || !title || !ctx) return window.__ws63OriginalOpenChartModal?.(key);

    activeDetailKey = key;
    title.innerHTML = '<i data-lucide="' + config.icon + '" width="18" height="18"></i> ' +
      config.title + ' <span class="modal-subtitle">' + granularityLabel(detailGranularity) + '</span>';
    ensureDetailGranularityControls(title, key);
    window.lucide?.createIcons?.();
    modal.classList.add("active");

    if (window.__ws63DetailedChart) window.__ws63DetailedChart.destroy();
    window.__ws63DetailedChart = new window.Chart(ctx, {
      type: config.type,
      data: {
        labels: rawLabels,
        datasets: [{
          label: config.unit,
          data: values,
          borderColor: config.color,
          backgroundColor: config.type === "line" ? "rgba(255, 193, 7, 0.12)" : config.bgColor,
          borderWidth: 3,
          fill: true,
          pointRadius: config.type === "line" ? 4 : 0,
          pointHoverRadius: config.type === "line" ? 8 : 0,
          pointHitRadius: 18,
          showLine: config.type === "line",
          pointBackgroundColor: "#161A1F",
          pointBorderColor: config.color,
          pointBorderWidth: 2
        }]
      },
      options: {
        onClick: (_event, elements, chart) => {
          const element = elements?.[0];
          if (!element) return;
          const index = element.index;
          const label = chart.data.labels?.[index] || "";
          const value = chart.data.datasets?.[0]?.data?.[index];
          setChartReadout(title, label, value, config.unit);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: "nearest",
            intersect: false,
            callbacks: {
              label: (context) => context.parsed.y === null || context.parsed.y === undefined ? "--" : context.parsed.y + " " + config.unit
            }
          }
        },
        scales: {
          x: { ticks: { color: "#8E9BAE", maxTicksLimit: 8 } },
          y: { position: "left", ticks: { color: "#8E9BAE" } }
        },
        interaction: { mode: "nearest", axis: "x", intersect: false },
        spanGaps: config.type === "line",
        animation: { duration: 0 },
        elements: { line: { tension: 0.4 } }
      }
    });
    fitChartScale(window.__ws63DetailedChart, values);
    window.__ws63DetailedChart.update("none");
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

  function attachThemeBridge() {
    ensureSystemActions();
    const button = document.getElementById("theme-toggle");
    if (!button || button.dataset.ws63ThemeBridge === "1") return;
    button.dataset.ws63ThemeBridge = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const isLight = document.body.classList.toggle("light-theme");
      button.innerHTML = '<i data-lucide="' + (isLight ? "moon" : "sun") + '" width="16" height="16"></i>';
      window.lucide?.createIcons?.();
    }, true);
  }

  function ensureSystemActions() {
    const sysStatus = document.querySelector(".sys-status");
    if (!sysStatus) return;
    const themeButton = document.getElementById("theme-toggle");
    if (themeButton) themeButton.classList.add("theme-btn");
    if (document.getElementById("ws63-wifi-action")) return;
    document.querySelectorAll(".sys-status [data-lucide='wifi'], .sys-status .lucide-wifi").forEach((node) => node.remove());
    const wrap = document.createElement("span");
    wrap.id = "ws63-wifi-wrap";
    wrap.className = "ws63-wifi-wrap";
    wrap.innerHTML = [
      '<button id="ws63-wifi-action" class="ws63-wifi-action" type="button" aria-label="连接 Wi-Fi">',
      '<i data-lucide="wifi" width="16" height="16"></i>',
      '</button>',
      '<span class="ws63-wifi-meta"><span id="ws63-wifi-signal">--dBm</span><span id="ws63-wifi-speed">--</span></span>'
    ].join("");
    sysStatus.appendChild(wrap);
    window.lucide?.createIcons?.();
  }

  function attachWifiBridge() {
    ensureSystemActions();
    const button = document.getElementById("ws63-wifi-action");
    if (!button || button.dataset.ws63WifiBridge === "1") return;
    button.dataset.ws63WifiBridge = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      send("connect-network");
    }, true);
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateTaskQueue(snapshot) {
    const cards = Array.isArray(snapshot.taskCards) ? snapshot.taskCards : [];
    const queue = document.querySelector("#view-tasks .queue-list");
    const header = document.querySelector("#view-tasks .task-panel:nth-child(2) .panel-header span");
    if (header) header.textContent = "任务队列 (" + cards.length + ")";
    if (!queue) return;
    if (cards.length === 0) {
      queue.innerHTML = '<div class="empty-state">暂无巡检任务</div>';
      return;
    }
    queue.innerHTML = snapshot.taskCards.map((task) => (
      '<div class="task-card ' + escapeHtml(task.status) + '">' +
        '<div class="tc-header"><span class="tc-title">' + escapeHtml(task.name) + '</span><span class="badge ' + escapeHtml(task.status) + '">' + escapeHtml(task.statusLabel) + '</span></div>' +
        '<div class="tc-meta"><i data-lucide="map-pin"></i> ' + escapeHtml(task.detail) + '</div>' +
        '<div class="tc-time">' + escapeHtml(task.timeLabel) + ' · ' + escapeHtml(task.baseStationId) + '</div>' +
      '</div>'
    )).join("");
    window.lucide?.createIcons?.();
  }

  function updateTaskTimeline(snapshot) {
    const items = Array.isArray(snapshot.taskTimeline) ? snapshot.taskTimeline : [];
    const timeline = document.querySelector("#view-tasks .timeline");
    const badge = document.querySelector("#view-tasks .tl-header-badge");
    if (badge) badge.textContent = snapshot.taskStatus === "--" ? "等待任务" : snapshot.taskStatus;
    if (!timeline || items.length === 0) return;
    timeline.innerHTML = items.map((item) => {
      const className = item.state === "idle" ? "tl-item" : "tl-item " + item.state;
      return '<div class="' + className + '">' +
        '<div class="tl-marker"></div>' +
        '<div class="tl-content">' +
          '<div class="tl-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="tl-meta">' + escapeHtml(item.meta) + '</div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function readSpeedPercent() {
    const speed = readSpeed();
    if (speed <= 2.5) return Math.max(0, Math.min(100, Math.round((speed / 2.0) * 100)));
    return Math.max(0, Math.min(100, Math.round(speed)));
  }

  function quantizedSpeedLimit() {
    const speedPercent = readSpeedPercent();
    if (speedPercent < 50) return 35;
    if (speedPercent < 80) return 70;
    return 100;
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
    const turn = y > 0 ? -x : x;
    const speedLimit = quantizedSpeedLimit();
    const left = Math.max(-100, Math.min(100, Math.round((y + turn) * speedLimit)));
    const right = Math.max(-100, Math.min(100, Math.round((y - turn) * speedLimit)));
    if (Math.hypot(x, y) < 0.16) {
      stopDrive();
      return;
    }
    startDrive({ left, right, speed: speedLimit, durationMs: 350 }, force);
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
      driveTimer = window.setInterval(() => repeatDrive(false), DRIVE_REPEAT_MS);
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
      event.stopImmediatePropagation();
      const templateNode = document.getElementById("ws63-patrol-template");
      const template = templateNode instanceof HTMLSelectElement ? templateNode.value : "closed-loop";
      send("create-patrol", { template });
    }, true);
    document.querySelector(".agent-card")?.addEventListener("click", () => send("refresh-agent"));
  }

  function setStatusClass(node, status) {
    if (!node) return;
    node.classList.remove("ws63-status-online", "ws63-status-warning", "ws63-status-offline");
    node.classList.add("ws63-status-" + (status || "offline"));
  }

  function updateTopStatus(snapshot) {
    ensureSystemActions();
    const status = document.querySelector(".cloud-status");
    if (status) {
      status.innerHTML = '<div class="status-dot"></div> ' + snapshot.activeTransportLabel;
      setStatusClass(status, snapshot.activeTransportStatus);
      status.title = "";
    }
    document.getElementById("ws63-battery-status")?.remove();
    document.querySelectorAll(".sys-status [data-lucide='battery-medium'], .sys-status .lucide-battery-medium").forEach((node) => node.remove());
    text("#ws63-wifi-signal", snapshot.wifiSignalLabel || "--dBm");
    text("#ws63-wifi-speed", snapshot.wifiSpeedLabel || "--");
  }

  function updateTopology(snapshot) {
    const card = document.querySelector(".topology-card");
    const nodes = Array.from(document.querySelectorAll(".topology-card .node"));
    const links = Array.from(document.querySelectorAll(".topology-card .link-line"));
    const labels = links.map((link) => {
      let label = link.querySelector(".link-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "link-label";
        link.appendChild(label);
      }
      return label;
    });
    card?.classList.toggle("ws63-topology-compact", snapshot.connectionMode !== "cloud");
    if (nodes[1]) {
      const label = nodes[1].querySelector(".node-label");
      if (label) label.textContent = "云服务器";
    }
    const nodeStatuses = [
      "online",
      snapshot.cloudServerStatus || "offline",
      snapshot.baseStationNodeStatus || "offline",
      snapshot.deviceNodeStatus || "offline"
    ];
    card?.setAttribute("title", "查看连接详情");
    nodes.forEach((node, index) => {
      node.classList.remove("active", "ws63-node-warning", "ws63-node-offline", "ws63-node-hidden");
      const hidden = (snapshot.connectionMode === "gateway" && index === 1)
        || (snapshot.connectionMode === "car-direct" && (index === 1 || index === 2));
      if (hidden) {
        node.classList.add("ws63-node-hidden");
        return;
      }
      const status = nodeStatuses[index] || "offline";
      if (status === "online") node.classList.add("active");
      else if (status === "warning") node.classList.add("ws63-node-warning");
      else node.classList.add("ws63-node-offline");
    });
    const linkStatuses = snapshot.connectionMode === "cloud"
      ? [snapshot.cloudServerStatus, snapshot.baseStationNodeStatus, snapshot.deviceNodeStatus]
      : snapshot.connectionMode === "gateway"
        ? ["offline", snapshot.baseStationNodeStatus, snapshot.deviceNodeStatus]
        : ["offline", "offline", snapshot.deviceNodeStatus];
    links.forEach((link, index) => {
      link.classList.remove("link-active", "link-warning", "ws63-link-warning", "ws63-link-offline", "ws63-link-hidden");
      const hidden = (snapshot.connectionMode === "gateway" && index === 0)
        || (snapshot.connectionMode === "car-direct" && index < 2);
      if (hidden) {
        link.classList.add("ws63-link-hidden");
        return;
      }
      const status = linkStatuses[index] || "offline";
      if (status === "online") link.classList.add("link-active");
      else if (status === "warning") link.classList.add("ws63-link-warning");
      else link.classList.add("ws63-link-offline");
    });
    labels.forEach((label, index) => {
      label.classList.remove("ws63-link-hidden");
      const hidden = (snapshot.connectionMode === "gateway" && index === 0)
        || (snapshot.connectionMode === "car-direct" && index < 2);
      if (hidden) label.classList.add("ws63-link-hidden");
    });
    if (labels[0]) labels[0].textContent = "wifi";
    if (labels[1]) labels[1].textContent = "wifi";
    if (labels[2]) labels[2].textContent = "sle";
  }

  function normalizeOverviewCardStyles() {
    const cards = Array.from(document.querySelectorAll("#view-overview .ov-data-card"));
    cards.forEach((card, index) => {
      if (index === 2) {
        card.classList.remove("warning", "highlight");
        card.classList.add("ws63-card-normalized");
      }
    });
  }

  function updateRiskCard(snapshot) {
    const risk = document.querySelector(".risk-card");
    if (!risk) return;
    risk.title = "查看 Agent 分析详情";
    risk.classList.remove("ws63-risk-low", "ws63-risk-medium", "ws63-risk-high");
    risk.classList.add("ws63-risk-" + snapshot.riskLevel);
    const title = risk.querySelector("h4");
    const summary = risk.querySelector("p");
    if (title) title.textContent = snapshot.riskLevel === "high" ? "高风险告警" : snapshot.riskLevel === "medium" ? "需关注风险" : "状态稳定";
    if (summary) summary.textContent = snapshot.riskSummary;
    risk.querySelector(".ws63-risk-list")?.remove();
    const list = document.createElement("ul");
    list.className = "ws63-risk-list";
    [...(snapshot.riskEvidence || []), ...(snapshot.riskSuggestions || [])].slice(0, 8).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    risk.querySelector(".risk-content")?.appendChild(list);
  }

  function openConnectionDetail() {
    const snapshot = window.__ws63MobileSnapshot;
    if (!snapshot) return;
    const modeLabel = snapshot.connectionMode === "cloud" ? "云服务器" : snapshot.connectionMode === "gateway" ? "星闪基站 Wi-Fi" : "小车直连";
    const stateLabel = snapshot.activeTransportStatus === "online" ? "已连接" : "未连接";
    const body = [
      infoGrid([
        ["连接方式", modeLabel],
        ["连接状态", stateLabel],
        ["云服务器", snapshot.cloudServerStatus === "online" ? "已连接" : "不可达"],
        ["基站心跳", snapshot.baseStationAgeLabel || "--"],
        ["小车遥测", snapshot.deviceAgeLabel || "--"],
        ["实时遥测", snapshot.telemetryDetail],
        ["信号强度", snapshot.wifiSignalLabel || snapshot.rssiLabel],
        ["数据速度", snapshot.wifiSpeedLabel || "--"],
        ["缓存条数", snapshot.cachedCountLabel],
        ["设备", snapshot.deviceName]
      ]),
      '<div class="ws63-info-section">' + escapeHtml(snapshot.activeTransportDetail || snapshot.notice || "暂无连接详情。") + '</div>',
      '<div class="ws63-info-section">手机通常只能同时连接一个 Wi-Fi。App 可在 Android 系统授权弹窗中请求连接设备热点；如果系统限制该能力，会退回系统 Wi-Fi 页面。</div>'
    ].join("");
    showInfoModal("连接详情", body);
  }

  function openAgentDetail() {
    const snapshot = window.__ws63MobileSnapshot;
    if (!snapshot) return;
    const level = snapshot.riskLevel === "high" ? "高风险" : snapshot.riskLevel === "medium" ? "需关注" : "稳定";
    const body = [
      infoGrid([
        ["风险等级", level],
        ["分析来源", "手机已拉取历史数据"],
        ["当前模式", snapshot.connectionModeLabel],
        ["最新状态", snapshot.activeTransportLabel]
      ]),
      '<div class="ws63-info-section">' + escapeHtml(snapshot.riskSummary || snapshot.agentSummary) + '</div>',
      '<div class="ws63-info-section"><strong>证据</strong>' + listHtml(snapshot.riskEvidence) + '</div>',
      '<div class="ws63-info-section"><strong>建议</strong>' + listHtml(snapshot.riskSuggestions) + '</div>'
    ].join("");
    showInfoModal("Agent 分析详情", body);
  }

  function attachInfoBridge() {
    if (document.body.dataset.ws63InfoBridge === "1") return;
    document.body.dataset.ws63InfoBridge = "1";
    document.body.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest?.(".topology-card")) {
        event.preventDefault();
        event.stopPropagation();
        openConnectionDetail();
        return;
      }
      if (target?.closest?.(".risk-card")) {
        event.preventDefault();
        event.stopPropagation();
        openAgentDetail();
      }
    }, true);
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    window.__ws63SeriesLabels = snapshot.seriesLabels;
    updateConnectionSwitch(snapshot.connectionMode);
    updateHistoryRange(snapshot.historyRange);
    text("[data-od-id='app-title']", "巡检控制平台");
    updateTopStatus(snapshot);
    updateTopology(snapshot);
    updateRiskCard(snapshot);
    window.setTimeout(() => text("[data-od-id='app-title']", "巡检控制平台"), 0);
    patchByText("dBm", snapshot.rssiLabel);
    patchByText("°C", snapshot.temperatureLabel);
    patchByText("%RH", snapshot.humidityLabel);
    patchByText("lx", snapshot.lightnessLabel);
    setMetric(0, snapshot.rssiLabel);
    setMetric(1, snapshot.temperatureLabel);
    setMetric(2, snapshot.humidityLabel);
    setMetric(3, snapshot.lightnessLabel);
    normalizeOverviewCardStyles();
    setDataMetric("m-temp", snapshot.temperatureLabel);
    setDataMetric("m-humid", snapshot.humidityLabel);
    setDataMetric("m-light", snapshot.lightnessLabel);
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
    updateTaskQueue(snapshot);
    updateTaskTimeline(snapshot);
    window.__ws63MobileSnapshot = snapshot;
  }

  window.addEventListener("load", () => {
    window.__ws63OriginalOpenChartModal = window.openChartModal;
    window.openChartModal = openLiveChartModal;
    setActiveView("view-overview");
    ensureConnectionSwitch();
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => setActiveView(item.dataset.target));
    });
    attachControlBridge();
    attachHistoryRangeBridge();
    attachThemeBridge();
    attachWifiBridge();
    attachInfoBridge();
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
  const normalizedHtml = html
    .replace(/云\s*API/g, "云服务器")
    .replace(/CAM-WS-01\s*直播流/g, "摄像头未接入")
    .replace(/环境湿度\s*[（(](?:预警|预测)[）)]/g, "环境湿度")
    .replace(/data:\s*\[-70,\s*-69,\s*-68,\s*-71,\s*-67,\s*-68,\s*-69,\s*-70,\s*-68,\s*-66,\s*-67,\s*-68,\s*-69,\s*-68,\s*-68,\s*-70,\s*-71,\s*-69,\s*-68,\s*-67,\s*-66,\s*-68,\s*-67,\s*-68\]/g, "data: Array(24).fill(null)")
    .replace(/data:\s*\[27\.8,\s*27\.9,\s*28\.0,\s*27\.9,\s*28\.1,\s*28\.2,\s*28\.1,\s*28\.3,\s*28\.4,\s*28\.4,\s*28\.5,\s*28\.4,\s*28\.6,\s*28\.5,\s*28\.4,\s*28\.5,\s*28\.4,\s*28\.3,\s*28\.4,\s*28\.4,\s*28\.3,\s*28\.2,\s*28\.3,\s*28\.4\]/g, "data: Array(24).fill(null)")
    .replace(/data:\s*\[45,\s*46,\s*45,\s*48,\s*52,\s*58,\s*65,\s*72,\s*75,\s*78,\s*80,\s*81,\s*79,\s*82,\s*81,\s*83,\s*82,\s*84,\s*83,\s*82,\s*81,\s*80,\s*81,\s*82\]/g, "data: Array(24).fill(null)")
    .replace(/data:\s*\[1200,\s*1210,\s*1205,\s*1215,\s*1220,\s*1218,\s*1230,\s*1225,\s*1240,\s*1235,\s*1245,\s*1240,\s*1250,\s*1248,\s*1245,\s*1255,\s*1240,\s*1235,\s*1245,\s*1240,\s*1230,\s*1240,\s*1245,\s*1240\]/g, "data: Array(24).fill(null)")
    .replace(/function generateMockData\(baseData, range, variance\)\s*\{\s*if\(range === '1H'\) return \[\.\.\.baseData\];\s*const len = range === '7D' \? 7 : 24; const res = \[\]; let val = baseData\[0\];\s*for\(let i=0; i<len; i\+\+\) \{ val = val \+ \(Math\.random\(\)\*variance\*2 - variance\); res\.push\(val\); \} return res;\s*\}/g, "function generateMockData(baseData, range, variance) { const len = range === '7D' ? 7 : 24; return Array(len).fill(null); }");
  const withPatch = normalizedHtml.includes("ws63-mobile-landscape-patch")
    ? normalizedHtml
    : injectBeforeCloseTag(normalizedHtml, "</head>", landscapePatch);
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

function taskStatusLabel(value?: string): string {
  return {
    pending: "待拉取",
    pulled: "已拉取",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[value ?? ""] ?? (value || "--");
}

function taskTimeLabel(task: PatrolTask): string {
  const value = task.finished_at ?? task.started_at ?? task.created_at;
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function patrolActionLabel(action: string): string {
  return {
    forward: "前进",
    backward: "后退",
    left: "左转",
    right: "右转",
    stop: "停止",
    auto_start: "方形闭环巡检",
    auto_return: "方角折返巡检",
    auto_stop: "停止预检",
    drive: "差速行驶"
  }[action] ?? action;
}

function parseTaskSteps(task: PatrolTask): Array<{ action?: string; speed?: number; durationMs?: number; duration_ms?: number }> {
  try {
    const parsed = JSON.parse(task.steps_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTaskStep(step: { action?: string; speed?: number; durationMs?: number; duration_ms?: number }): string {
  const action = String(step.action ?? "forward");
  const duration = Number(step.durationMs ?? step.duration_ms ?? 0);
  const durationLabel = duration > 0 ? ` ${(duration / 1000).toFixed(duration % 1000 === 0 ? 0 : 1)}s` : "";
  if (action === "stop") return `停顿${durationLabel}`;
  const speed = Number.isFinite(step.speed) ? ` ${step.speed}%` : "";
  return `${patrolActionLabel(action)}${speed}${durationLabel}`;
}

function taskDetail(task: PatrolTask): string {
  const steps = parseTaskSteps(task);
  if (steps.length === 0) return "等待基站执行巡检路线";
  return steps.slice(0, 4).map(formatTaskStep).join(" -> ");
}

function isLocalPatrolTask(task: PatrolTask): boolean {
  return task.id.startsWith("local-task-");
}

function buildTaskCards(tasks: PatrolTask[]): MobileTaskCard[] {
  return tasks.slice(0, 5).map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    detail: taskDetail(task),
    timeLabel: taskTimeLabel(task),
    baseStationId: task.base_station_id
  }));
}

function buildTaskTimeline(task?: PatrolTask): MobileTaskTimelineItem[] {
  if (!task) {
    return [
      { title: "等待创建巡检任务", meta: "可选择方形闭环或方角折返", state: "idle" },
      { title: "等待基站拉取", meta: "任务创建后显示真实状态", state: "idle" },
      { title: "等待线路执行", meta: "向固件下发所选路线命令", state: "idle" },
      { title: "等待完成回执", meta: "完成或失败后在此处显示结果", state: "idle" }
    ];
  }
  if (task.status === "cancelled") {
    return [
      { title: "任务已创建", meta: taskTimeLabel(task), state: "done" },
      { title: "任务已取消", meta: "任务已停止调度", state: "error" },
      { title: "线路未继续执行", meta: "未收到执行回执", state: "idle" },
      { title: "完成回执", meta: "任务取消，无完成回执", state: "idle" }
    ];
  }
  const pulled = ["pulled", "running", "completed", "failed"].includes(task.status);
  const running = ["running", "completed", "failed"].includes(task.status);
  const finished = ["completed", "failed"].includes(task.status);
  return [
    { title: "任务已创建", meta: taskTimeLabel(task), state: "done" },
    {
      title: isLocalPatrolTask(task) ? "本地指令已发送" : "基站已拉取",
      meta: task.status === "pending" ? "等待巡检桥接或基站拉取" : isLocalPatrolTask(task) ? "已向固件下发所选路线命令" : "任务已进入基站侧队列",
      state: pulled || isLocalPatrolTask(task) ? "done" : "idle"
    },
    {
      title: "巡检路线执行",
      meta: taskDetail(task),
      state: task.status === "failed" ? "error" : running && !finished ? "active" : running ? "done" : "idle"
    },
    {
      title: "完成回执",
      meta: task.status === "failed"
        ? "执行失败，请检查基站和小车链路"
        : task.finished_at
          ? isLocalPatrolTask(task) ? `${taskTimeLabel(task)} 手机端按路线时长推断` : taskTimeLabel(task)
          : "等待完成",
      state: task.status === "failed" ? "error" : task.status === "completed" ? "done" : "idle"
    }
  ];
}

function reportRiskLevel(report?: AgentReport): "low" | "medium" | "high" {
  return report?.riskLevel ?? report?.risk_level ?? "low";
}

function reportSuggestions(report?: AgentReport): string[] {
  return parseJsonList(report?.suggestions ?? report?.suggestions_json)
    .map((item) => String(item))
    .filter(Boolean);
}

function reportEvidence(report?: AgentReport): string[] {
  return parseJsonList(report?.evidence ?? report?.evidence_json)
    .map((item) => {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        return `${record.label ?? record.code ?? "证据"}: ${record.value ?? "--"}`;
      }
      return String(item);
    })
    .filter(Boolean);
}

function latestAgeMs(reading?: Reading): number {
  if (!reading) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(reading.recordedAt);
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.POSITIVE_INFINITY;
}

function ageLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return "--";
  if (ageMs < 60_000) return "不到 1 分钟";
  if (ageMs < 60 * 60_000) return `${Math.round(ageMs / 60_000)} 分钟`;
  return `${Math.round(ageMs / (60 * 60_000))} 小时`;
}

function telemetryFreshness(latest?: Reading | null): {
  status: "live" | "stale" | "empty";
  detail: string;
  ageMs: number;
} {
  if (!latest) return { status: "empty", detail: "尚未收到实时遥测", ageMs: Number.POSITIVE_INFINITY };
  const ageMs = latestAgeMs(latest);
  if (ageMs < 90_000) return { status: "live", detail: "实时遥测正常", ageMs };
  return { status: "stale", detail: `实时遥测延迟 ${ageLabel(ageMs)}`, ageMs };
}

function isoAgeMs(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : Number.POSITIVE_INFINITY;
}

function topologyStatusFromAge(ageMs: number): MobileTopologyStatus {
  if (ageMs < 90_000) return "online";
  if (ageMs < 5 * 60_000) return "warning";
  return "offline";
}

function topologyAgeLabel(ageMs: number, emptyLabel: string): string {
  if (!Number.isFinite(ageMs)) return emptyLabel;
  return `${ageLabel(ageMs)}前`;
}

function topologyDetail(name: string, status: MobileTopologyStatus, ageMs: number, emptyLabel: string): string {
  if (!Number.isFinite(ageMs)) return `${name}${emptyLabel}`;
  if (status === "online") return `${name}最近 ${ageLabel(ageMs)}内有数据`;
  if (status === "warning") return `${name}数据延迟 ${ageLabel(ageMs)}`;
  return `${name}超过 ${ageLabel(ageMs)}未更新`;
}

function transportName(mode: ConnectionMode): string {
  if (mode === "gateway") return "基站";
  if (mode === "car-direct") return "小车";
  return "云服务器";
}

function activeTransport(input: MobileOpenDesignSnapshotInput, telemetry: ReturnType<typeof telemetryFreshness>): {
  status: MobileTopologyStatus;
  label: string;
  detail: string;
} {
  const hasError = Boolean(input.notice);
  const fresh = telemetry.status === "live";
  const name = transportName(input.connectionMode);
  const connected = fresh && !hasError;
  const shortLabel = `${name}${connected ? "已连接" : "未连接"}`;
  const delayLabel = `${name}延迟较大`;
  if (input.connectionMode === "cloud") {
    const online = Boolean(input.cloudApiOnline);
    if (online) {
      return {
        status: "online",
        label: "云服务器已连接",
        detail: `云服务器 HTTPS 正常。${telemetry.detail}。`
      };
    }
    return {
      status: "offline",
      label: "云服务器未连接",
      detail: input.notice || "云服务器暂时不可达，历史曲线仍可来自手机本地缓存。"
    };
  }
  if (input.connectionMode === "gateway") {
    if (hasError) return { status: "offline", label: shortLabel, detail: input.notice };
    if (connected) return { status: "online", label: shortLabel, detail: "已通过基站 Wi-Fi/UDP 获取小车实时遥测。" };
    if (telemetry.status !== "empty") return { status: "warning", label: delayLabel, detail: input.notice || "基站最近有数据但已超时，建议点击右上角 Wi-Fi 重新请求连接。" };
    return { status: "offline", label: shortLabel, detail: input.notice || "未收到基站实时遥测，点击右上角 Wi-Fi 可请求连接基站热点。" };
  }
  if (hasError) return { status: "offline", label: shortLabel, detail: input.notice };
  if (connected) return { status: "online", label: shortLabel, detail: "已通过小车直连链路获取实时遥测。" };
  if (telemetry.status !== "empty") return { status: "warning", label: delayLabel, detail: input.notice || "小车直连最近有数据但已超时，建议重新连接小车热点。" };
  return { status: "offline", label: shortLabel, detail: input.notice || "未收到小车直连实时遥测，点击右上角 Wi-Fi 可请求连接小车热点。" };
}

function dataRateLabel(latest?: Reading | null, previous?: Reading | null): string {
  if (!latest || !previous) return "--";
  const latestAt = Date.parse(latest.recordedAt);
  const previousAt = Date.parse(previous.recordedAt);
  const deltaMs = latestAt - previousAt;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 90_000) return "--";
  return `${(1000 / deltaMs).toFixed(1)}Hz`;
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
    bucketMs: range.bucketMs,
    granularity: historyRange === "1H" ? "minute" : historyRange === "24H" ? "hour" : "day"
  });
}

function overviewSeries(readings: Reading[], field: "rssi" | "temperature" | "humidity" | "lightness") {
  const to = Date.now();
  return buildTimeSeries({
    readings,
    field,
    from: new Date(to - 60 * 60 * 1000).toISOString(),
    to: new Date(to).toISOString(),
    bucketMs: 60 * 1000,
    granularity: "minute"
  });
}

function detailSeries(readings: Reading[], granularity: SeriesGranularity, field: "rssi" | "temperature" | "humidity" | "lightness") {
  const to = Date.now();
  return buildTimeSeries({
    readings,
    field,
    from: new Date(to - durationMsForGranularity(granularity)).toISOString(),
    to: new Date(to).toISOString(),
    bucketMs: bucketMsForGranularity(granularity),
    granularity
  });
}

function detailSeriesGroup(readings: Reading[], granularity: SeriesGranularity) {
  const temperature = detailSeries(readings, granularity, "temperature");
  return {
    labels: temperature.map((point) => point.label),
    rssi: detailSeries(readings, granularity, "rssi").map((point) => point.value),
    temperature: temperature.map((point) => point.value),
    humidity: detailSeries(readings, granularity, "humidity").map((point) => point.value),
    lightness: detailSeries(readings, granularity, "lightness").map((point) => point.value)
  };
}

export function buildMobileOpenDesignSnapshot(input: MobileOpenDesignSnapshotInput): MobileOpenDesignSnapshot {
  const latest = input.realtimeReading ?? null;
  const sampledReadings = sampleReadingsByInterval(input.readings, 1000);
  const latestForHistory = sampledReadings.at(-1);
  const base = input.baseStations.find((item) => item.id === input.selectedDevice?.base_station_id) ?? input.baseStations[0];
  const latestReport = input.reports[0];
  const report = normalizeAgentReport(latestReport);
  const command = input.commands[0];
  const task = input.tasks[0];
  const telemetry = telemetryFreshness(latest);
  const hasBlockingRealtimeError = input.connectionMode !== "cloud" && Boolean(input.notice);
  const hasRealtime = telemetry.status === "live" && !hasBlockingRealtimeError;
  const rssi = hasRealtime ? latest?.rssi : undefined;
  const cachedCount = latestForHistory?.cachedCount ?? base?.cached_count ?? 0;
  const temperatureSeries = overviewSeries(sampledReadings, "temperature");
  const humiditySeries = overviewSeries(sampledReadings, "humidity");
  const lightnessSeries = overviewSeries(sampledReadings, "lightness");
  const rssiSeries = overviewSeries(sampledReadings, "rssi");
  const transport = activeTransport(input, telemetry);
  const cloudServerStatus: MobileTopologyStatus =
    input.connectionMode === "cloud" && input.cloudApiOnline ? "online" : "offline";
  const latestTelemetryAge = latest ? latestAgeMs(latest) : Number.POSITIVE_INFINITY;
  const baseHeartbeatAge = Math.min(isoAgeMs(base?.last_heartbeat), latestTelemetryAge);
  const deviceTelemetryAge = Math.min(isoAgeMs(input.selectedDevice?.last_seen), latestTelemetryAge);
  const localTelemetryAge = hasBlockingRealtimeError ? Number.POSITIVE_INFINITY : telemetry.ageMs;
  const baseStationAge = input.connectionMode === "cloud"
    ? baseHeartbeatAge
    : input.connectionMode === "gateway"
      ? localTelemetryAge
      : Number.POSITIVE_INFINITY;
  const deviceAge = input.connectionMode === "cloud" ? deviceTelemetryAge : localTelemetryAge;
  const baseStationNodeStatus: MobileTopologyStatus = input.connectionMode === "car-direct"
    ? "offline"
    : topologyStatusFromAge(baseStationAge);
  const deviceNodeStatus: MobileTopologyStatus = topologyStatusFromAge(deviceAge);

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
    temperatureLabel: `${formatNumber(hasRealtime ? latest?.temperature : undefined)}°C`,
    humidityLabel: `${formatNumber(hasRealtime ? latest?.humidity : undefined, 0)}%RH`,
    lightnessLabel: `${formatNumber(hasRealtime ? latest?.lightness : undefined, 0)} lx`,
    commandStatus: command ? `${command.payload} / ${command.status}` : "--",
    taskStatus: task ? taskStatusLabel(task.status) : "--",
    taskCards: buildTaskCards(input.tasks),
    taskTimeline: buildTaskTimeline(task),
    agentSummary: report.summary,
    notice: input.notice,
    cloudServerStatus,
    baseStationNodeStatus,
    deviceNodeStatus,
    cloudServerDetail: cloudServerStatus === "online" ? "云服务器 HTTPS 正常" : "云服务器不可达",
    baseStationDetail: topologyDetail("基站", baseStationNodeStatus, baseStationAge, "无心跳"),
    deviceDetail: topologyDetail("小车", deviceNodeStatus, deviceAge, "无遥测"),
    baseStationAgeLabel: topologyAgeLabel(baseStationAge, "无基站心跳"),
    deviceAgeLabel: topologyAgeLabel(deviceAge, "无小车遥测"),
    telemetryStatus: telemetry.status,
    telemetryDetail: telemetry.detail,
    activeTransportStatus: transport.status,
    activeTransportLabel: transport.label,
    activeTransportDetail: transport.detail,
    wifiSignalLabel: Number.isFinite(rssi) ? `${rssi}dBm` : "--dBm",
    wifiSpeedLabel: hasRealtime ? dataRateLabel(latest, input.previousRealtimeReading) : "--",
    riskLevel: reportRiskLevel(latestReport),
    riskSummary: report.summary,
    riskSuggestions: reportSuggestions(latestReport),
    riskEvidence: reportEvidence(latestReport),
    connectionMode: input.connectionMode,
    historyRange: input.historyRange,
    seriesLabels: temperatureSeries.map((point) => point.label),
    series: {
      rssi: rssiSeries.map((point) => point.value),
      temperature: temperatureSeries.map((point) => point.value),
      humidity: humiditySeries.map((point) => point.value),
      lightness: lightnessSeries.map((point) => point.value)
    },
    detailSeries: {
      second: detailSeriesGroup(sampledReadings, "second"),
      minute: detailSeriesGroup(sampledReadings, "minute"),
      hour: detailSeriesGroup(sampledReadings, "hour"),
      day: detailSeriesGroup(sampledReadings, "day")
    }
  };
}
