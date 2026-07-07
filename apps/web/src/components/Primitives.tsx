import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type { RiskLevel } from "../api";

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  return <span className={`risk-badge ${level}`}>{label ?? (level === "high" ? "HIGH 高风险" : level === "medium" ? "MEDIUM 需关注" : "LOW 稳定")}</span>;
}

export function StatusBadge({ online, children }: { online: boolean; children: string }) {
  return <span className={online ? "badge online" : "badge offline"}>{children}</span>;
}

export function MiniChart({ values, color = "var(--color-cyan)" }: { values: number[]; color?: string }) {
  const points = values.length > 0 ? values : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const d = points.map((value, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
    const y = 40 - ((value - min) / Math.max(1, max - min)) * 32;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg className="mini-chart" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} stroke={color} />
    </svg>
  );
}

export function TrendChart({ values, color, label }: { values: number[]; color: string; label: string }) {
  return (
    <div className="chart-wrapper">
      <div className="chart-label" style={{ color }}>{label}</div>
      <div className="canvas-container"><MiniChart values={values} color={color} /></div>
    </div>
  );
}

export function OverviewDataCard({
  icon: Icon,
  label,
  value,
  unit,
  status,
  tone,
  values,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  status?: string;
  tone?: "highlight" | "warning" | "danger";
  values: number[];
  onClick: () => void;
}) {
  const color = tone === "warning" ? "var(--color-amber)" : tone === "danger" ? "var(--color-red)" : "var(--color-cyan)";
  return (
    <button className={`ov-data-card ${tone ?? ""}`} onClick={onClick}>
      <div className="data-top-row-card">
        <div className="ov-data-header">
          <Icon width={16} height={16} />
          <span className="ov-data-label">{label}</span>
          {status && <span className="ov-data-status">{status}</span>}
        </div>
        <div className="ov-data-value">{value} <span className="ov-data-unit">{unit}</span></div>
      </div>
      <div className="ov-chart-container"><MiniChart values={values} color={color} /></div>
    </button>
  );
}

export function ChartModal({
  open,
  title,
  subtitle,
  values,
  color,
  onClose
}: {
  open: boolean;
  title: string;
  subtitle: string;
  values: number[];
  color: string;
  onClose: () => void;
}) {
  return (
    <div className={open ? "modal-overlay active" : "modal-overlay"} onClick={onClose}>
      <div className="modal-container" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}<span className="modal-subtitle">{subtitle}</span></div>
          <button className="modal-close" onClick={onClose} aria-label="关闭趋势图"><X width={20} height={20} /></button>
        </div>
        <div className="modal-body">
          <div className="detailed-chart-container"><MiniChart values={values} color={color} /></div>
        </div>
      </div>
    </div>
  );
}
