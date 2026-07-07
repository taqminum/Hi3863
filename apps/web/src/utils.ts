import type { AgentReport, RiskLevel, Role } from "./api";
import type { Tab } from "./views";

export function formatTime(value?: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function roleName(role: Role): string {
  return role === "admin" ? "管理员" : role === "operator" ? "操作员" : "观察员";
}

export function pageTitle(tab: Tab): string {
  return {
    overview: "运行总览",
    control: "实时遥控",
    patrol: "巡检任务",
    history: "历史趋势",
    agent: "Agent 分析",
    devices: "设备与基站",
    audit: "权限与审计",
    debug: "后端验收"
  }[tab];
}

export function normalizeReport(report?: AgentReport): { level: RiskLevel; summary: string; suggestions: string[]; time: string } {
  const suggestions = report?.suggestions ?? (report?.suggestions_json ? JSON.parse(report.suggestions_json) as string[] : []);
  return {
    level: report?.riskLevel ?? report?.risk_level ?? "low",
    summary: report?.summary ?? "等待 Agent 分析结果",
    suggestions,
    time: formatTime(report?.createdAt ?? report?.created_at)
  };
}

export function isOnline(value?: string): boolean {
  return value === "online" || value === "cloud-online";
}
