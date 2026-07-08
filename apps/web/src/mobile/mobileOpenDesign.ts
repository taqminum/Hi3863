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
import type { ConnectionMode } from "../App";

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
}

const landscapePatch = `<style id="ws63-mobile-landscape-patch">
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
</style>`;

const bridgeScript = `<script id="ws63-mobile-host-bridge">
(() => {
  const SOURCE = "ws63-mobile-open-design";
  const HOST = "ws63-mobile-host";
  let lastDriveAt = 0;
  let currentSpeed = 0.8;

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
    const now = Date.now();
    if (!force && now - lastDriveAt < 180) return;
    lastDriveAt = now;
    const rect = base.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    if (!point) return;
    const dx = point.clientX - rect.left - rect.width / 2;
    const dy = point.clientY - rect.top - rect.height / 2;
    const radius = 40;
    const x = Math.max(-1, Math.min(1, dx / radius));
    const y = Math.max(-1, Math.min(1, -dy / radius));
    const left = Math.max(-100, Math.min(100, Math.round((y + x) * 70)));
    const right = Math.max(-100, Math.min(100, Math.round((y - x) * 70)));
    if (Math.hypot(x, y) < 0.16) {
      send("stop");
      return;
    }
    send("drive", { left, right, speed: readSpeed(), durationMs: 350 });
  }

  function attachControlBridge() {
    const joystickBase = document.getElementById("joystick-base");
    if (joystickBase) {
      joystickBase.addEventListener("mousemove", (event) => emitDriveFromPointer(event, false));
      joystickBase.addEventListener("touchmove", (event) => emitDriveFromPointer(event, false), { passive: true });
      joystickBase.addEventListener("mouseup", () => send("stop"));
      joystickBase.addEventListener("touchend", () => send("stop"));
    }
    document.getElementById("speed-slider")?.addEventListener("touchend", readSpeed);
    document.getElementById("speed-slider")?.addEventListener("mouseup", readSpeed);
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    text("[data-od-id='app-title']", "WS63E 控制台");
    patchByText("dBm", snapshot.rssiLabel);
    patchByText("°C", snapshot.temperatureLabel);
    patchByText("%RH", snapshot.humidityLabel);
    patchByText("lx", snapshot.lightnessLabel);
    window.__ws63MobileSnapshot = snapshot;
  }

  window.addEventListener("load", () => {
    setActiveView("view-overview");
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => setActiveView(item.dataset.target));
    });
    attachControlBridge();
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

export function buildMobileOpenDesignSrcDoc(html: string): string {
  const withPatch = html.includes("ws63-mobile-landscape-patch")
    ? html
    : injectBeforeCloseTag(html, "</head>", landscapePatch);
  return withPatch.includes("ws63-mobile-host-bridge")
    ? withPatch
    : injectBeforeCloseTag(withPatch, "</body>", bridgeScript);
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

function series(readings: Reading[], field: "rssi" | "temperature" | "humidity" | "lightness"): number[] {
  const values = readings.slice(-24).map((reading) => Number(reading[field] ?? 0));
  return values.length > 0 ? values : Array.from({ length: 24 }, () => 0);
}

export function buildMobileOpenDesignSnapshot(input: MobileOpenDesignSnapshotInput): MobileOpenDesignSnapshot {
  const latest = input.readings.at(-1);
  const base = input.baseStations.find((item) => item.id === input.selectedDevice?.base_station_id) ?? input.baseStations[0];
  const report = normalizeAgentReport(input.reports[0]);
  const command = input.commands[0];
  const task = input.tasks[0];
  const rssi = latest?.rssi ?? base?.last_rssi;
  const cachedCount = latest?.cachedCount ?? base?.cached_count ?? 0;

  return {
    userLabel: input.user.displayName || input.user.username,
    roleLabel: roleLabel(input.user.role),
    connectionModeLabel: input.connectionMode === "local" ? "本地直连" : "云端基站",
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
    series: {
      rssi: series(input.readings, "rssi"),
      temperature: series(input.readings, "temperature"),
      humidity: series(input.readings, "humidity"),
      lightness: series(input.readings, "lightness")
    }
  };
}
