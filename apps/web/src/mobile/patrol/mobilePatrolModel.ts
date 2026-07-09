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
      { title: "等待线路执行", meta: "执行进度由基站回执更新", state: "idle" },
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
    {
      title: pulled ? "基站已拉取" : "等待基站拉取",
      meta: pulled ? "任务已进入基站侧队列" : "等待巡检桥接或基站拉取",
      state: pulled ? "done" : "idle"
    },
    {
      title: task.status === "failed" ? "线路执行失败" : running ? "线路执行中" : "等待线路执行",
      meta: task.status === "failed" ? "执行失败，请检查基站和小车链路" : mobilePatrolTaskDetail(task),
      state: task.status === "failed" ? "error" : task.status === "running" ? "active" : running ? "done" : "idle"
    },
    {
      title: task.status === "completed" || task.status === "failed" ? "完成回执" : "等待完成回执",
      meta: task.finished_at ? formatTaskTime(task) : "等待完成",
      state: task.status === "completed" ? "done" : "idle"
    }
  ];
}

function cardKind(task: PatrolTask, connectionMode: ConnectionMode = "cloud"): "cloud" | "local" {
  if (connectionMode === "gateway" || connectionMode === "car-direct") return "local";
  return task.id.startsWith("local-task-") || task.created_by === "local-field-operator" ? "local" : "cloud";
}

function cardStatusLabel(task: PatrolTask): string {
  if (cardKind(task) === "local" && task.status === "running") return "本地执行中";
  return STATUS_LABELS[task.status];
}

function taskForStatusLabel(task: PatrolTask, connectionMode: ConnectionMode): PatrolTask {
  if (cardKind(task, connectionMode) === "local") return { ...task, id: `local-task-${task.id}` };
  return task;
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
  const latestTask = input.tasks[0] ? taskForStatusLabel(input.tasks[0], input.connectionMode) : undefined;

  return {
    deviceName: input.selectedDevice?.name ?? "未选择目标小车",
    baseStationName: selectedBase
      ? `${selectedBase.name} ${selectedBase.status === "online" ? "在线" : "离线"}`
      : input.selectedDevice?.base_station_id ?? "未绑定基站",
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
      kind: cardKind(task, input.connectionMode),
      name: task.name,
      status: task.status,
      statusLabel: cardStatusLabel(taskForStatusLabel(task, input.connectionMode)),
      detail: mobilePatrolTaskDetail(task),
      timeLabel: formatTaskTime(task),
      baseStationId: task.base_station_id
    })),
    timeline: mobilePatrolTimeline(latestTask),
    timelineStatusLabel: latestTask ? cardStatusLabel(latestTask) : "等待任务",
    notice: input.notice
  };
}
