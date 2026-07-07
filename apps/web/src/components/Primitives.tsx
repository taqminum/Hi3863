import { useMemo } from "react";
import type { Reading, RiskLevel } from "../api";
import { formatTime, isOnline } from "../utils";

export function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function StatusRow({ name, status, time }: { name: string; status: string; time?: string | null }) {
  return (
    <div className="status-row">
      <span>{name}</span>
      <b className={isOnline(status.split(" ")[0]) ? "state-online" : "state-offline"}>{status}</b>
      <time>{formatTime(time)}</time>
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <strong className={`risk ${level}`}>{level === "high" ? "高风险" : level === "medium" ? "需关注" : "稳定"}</strong>;
}

export function Chart({ readings, field, color, label }: { readings: Reading[]; field: "temperature" | "humidity" | "lightness"; color: string; label: string }) {
  const points = useMemo(() => readings.slice(-48).map((reading) => reading[field]), [readings, field]);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const d = points.map((value, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
    const y = 36 - ((value - min) / Math.max(1, max - min)) * 30;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return (
    <div className="chart">
      <div><span>{label}</span><b>{points.at(-1)?.toFixed(1) ?? "--"}</b></div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d={d} stroke={color} /></svg>
    </div>
  );
}
