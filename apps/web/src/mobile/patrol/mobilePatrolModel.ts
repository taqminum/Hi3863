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
    label: "鍥轰欢棰勬绾胯矾",
    name: "棰勬绾胯矾",
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
    label: "浜戠宸℃浠诲姟",
    name: "浜戠宸℃浠诲姟",
    steps: [
      { action: "forward", speed: 50, durationMs: 1200 },
      { action: "left", speed: 40, durationMs: 500 },
      { action: "forward", speed: 45, durationMs: 1000 },
      { action: "stop", speed: 0, durationMs: 500 }
    ]
  }
] as const satisfies readonly MobilePatrolRouteTemplate[];

const ACTION_LABELS: Record<string, string> = {
  forward: "鍓嶈繘",
  backward: "鍚庨€€",
  left: "宸﹁浆",
  right: "鍙宠浆",
  stop: "鍋滄"
};

const STATUS_LABELS: Record<PatrolTask["status"], string> = {
  pending: "绛夊緟鎷夊彇",
  pulled: "宸叉媺鍙?",
  running: "鎵ц涓?",
  completed: "宸插畬鎴?",
  failed: "澶辫触",
  cancelled: "宸插彇娑?"
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
  if (steps.length === 0) return "绛夊緟鍩虹珯鎵ц璺嚎";
  return steps.slice(0, 4).map(formatStep).join(" -> ");
}

export function mobilePatrolTimeline(task?: PatrolTask): MobilePatrolTimelineItem[] {
  if (!task) {
    return [
      { title: "绛夊緟鍒涘缓宸℃浠诲姟", meta: "浜戠銆佸熀绔欐垨灏忚溅鐩磋繛鍧囧彲鍙戣捣", state: "idle" },
      { title: "绛夊緟鍩虹珯鎷夊彇", meta: "浠诲姟鍒涘缓鍚庢樉绀虹湡瀹炵姸鎬?", state: "idle" },
      { title: "绛夊緟绾胯矾鎵ц", meta: "鎵ц杩涘害鐢变换鍔″洖鎵ф洿鏂?", state: "idle" },
      { title: "绛夊緟瀹屾垚鍥炴墽", meta: "瀹屾垚鎴栧け璐ュ悗鍦ㄦ澶勬樉绀虹粨鏋?", state: "idle" }
    ];
  }
  if (task.status === "cancelled") {
    return [
      { title: "浠诲姟宸插垱寤?", meta: formatTaskTime(task), state: "done" },
      { title: "浠诲姟宸插彇娑?", meta: "浠诲姟宸插仠姝㈣皟搴?", state: "error" },
      { title: "绾胯矾鏈户缁墽琛?", meta: "鏈敹鍒版墽琛屽洖鎵?", state: "idle" },
      { title: "瀹屾垚鍥炴墽", meta: "浠诲姟鍙栨秷锛屾棤瀹屾垚鍥炴墽", state: "idle" }
    ];
  }
  const pulled = ["pulled", "running", "completed", "failed"].includes(task.status);
  const running = ["running", "completed"].includes(task.status);
  return [
    { title: "浠诲姟宸插垱寤?", meta: formatTaskTime(task), state: "done" },
    {
      title: pulled ? "鍩虹珯宸叉媺鍙?" : "绛夊緟鍩虹珯鎷夊彇",
      meta: pulled ? "浠诲姟宸茶繘鍏ュ熀绔欎晶闃熷垪" : "绛夊緟宸℃妗ユ帴鎴栧熀绔欐媺鍙?",
      state: pulled ? "done" : "idle"
    },
    {
      title: task.status === "failed" ? "绾胯矾鎵ц澶辫触" : running ? "绾胯矾鎵ц涓?" : "绛夊緟绾胯矾鎵ц",
      meta: task.status === "failed" ? "鎵ц澶辫触锛岃妫€鏌ュ熀绔欏拰灏忚溅閾捐矾" : mobilePatrolTaskDetail(task),
      state: task.status === "failed" ? "error" : task.status === "running" ? "active" : running ? "done" : "idle"
    },
    {
      title: task.status === "completed" || task.status === "failed" ? "瀹屾垚鍥炴墽" : "绛夊緟瀹屾垚鍥炴墽",
      meta: task.finished_at ? formatTaskTime(task) : "绛夊緟瀹屾垚",
      state: task.status === "completed" ? "done" : "idle"
    }
  ];
}

function cardKind(task: PatrolTask): "cloud" | "local" {
  return task.id.startsWith("local-task-") || task.created_by === "local-field-operator" ? "local" : "cloud";
}

function cardStatusLabel(task: PatrolTask): string {
  if (cardKind(task) === "local" && task.status === "running") return "鏈湴鎵ц涓?";
  return STATUS_LABELS[task.status];
}

export function buildMobilePatrolModel(input: MobilePatrolModelInput): MobilePatrolModel {
  const selectedBase = input.baseStations.find((base) => base.id === input.selectedDevice?.base_station_id);
  const isCloud = input.connectionMode === "cloud";
  const disabledReason = !input.selectedDevice
    ? "鏈€夋嫨鐩爣灏忚溅"
    : isCloud && !input.token
      ? "璇峰厛鐧诲綍浜戠璐﹀彿"
      : isCloud && !input.cloudApiOnline
        ? "浜戞湇鍔″櫒鏈繛鎺?"
        : isCloud && !input.selectedDevice.base_station_id
          ? "鏈粦瀹氬熀绔?"
          : "";
  const latestTask = input.tasks[0];

  return {
    deviceName: input.selectedDevice?.name ?? "鏈€夋嫨鐩爣灏忚溅",
    baseStationName: selectedBase ? `${selectedBase.name} ${selectedBase.status === "online" ? "鍦ㄧ嚎" : "绂荤嚎"}` : input.selectedDevice?.base_station_id ?? "鏈粦瀹氬熀绔?",
    signalLabel: "-- dBm",
    routeTemplates: MOBILE_PATROL_ROUTE_TEMPLATES,
    selectedTemplateId: isCloud ? "cloud-standard" : "firmware-precheck",
    defaultTaskName: isCloud ? "浜戠宸℃浠诲姟" : "棰勬绾胯矾",
    estimatedDurationLabel: "绾?7.7s",
    canCreate: disabledReason === "",
    disabledReason,
    primaryActionLabel: isCloud ? "涓€閿笅鍙戜换鍔?" : "鍚姩鏈湴宸℃",
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
    timelineStatusLabel: latestTask ? cardStatusLabel(latestTask) : "绛夊緟浠诲姟",
    notice: input.notice
  };
}
