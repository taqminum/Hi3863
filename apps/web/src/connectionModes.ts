import type { ConnectionMode } from "./types";

export const connectionModes: ConnectionMode[] = ["cloud", "gateway", "car-direct"];

export function normalizeConnectionMode(value: unknown): ConnectionMode {
  if (value === "cloud" || value === "gateway" || value === "car-direct") return value;
  if (value === "local") return "gateway";
  return "cloud";
}

export function connectionModeLabel(mode: ConnectionMode): string {
  if (mode === "cloud") return "云服务器";
  if (mode === "gateway") return "星闪基站 Wi-Fi";
  return "小车直连";
}

export function transportLabel(mode: ConnectionMode): string {
  if (mode === "cloud") return "HTTPS";
  if (mode === "gateway") return "UDP";
  return "HTTP";
}

export function connectionNotice(mode: ConnectionMode): string {
  if (mode === "cloud") return "已切换到云服务器模式，使用长期历史数据。";
  if (mode === "gateway") return "已切换到星闪基站 Wi-Fi，请连接 WS63E_ENV_GATEWAY。";
  return "已切换到小车直连，请连接 WS63E_ENV_CAR。";
}
