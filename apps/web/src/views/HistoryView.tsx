import { Activity, Bot, Cloud, Database, Droplets, Gauge, RadioTower, Sparkles, Sun, Thermometer, TrendingUp } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { ChartModal, RiskBadge, TrendChart } from "../components/Primitives";
import { numericSeries, type DashboardViewModel } from "../viewModels";

type Range = "1H" | "24H" | "7D";
type MetricKey = "temp" | "humid" | "light";

const rangeLimit: Record<Range, number> = { "1H": 24, "24H": 48, "7D": 96 };
const metricMeta = {
  temp: { title: "温度趋势", color: "var(--color-orange)", label: "TEMP" },
  humid: { title: "湿度趋势", color: "var(--color-cyan-blue)", label: "HUMID" },
  light: { title: "光照趋势", color: "var(--color-gold)", label: "LIGHT" }
};

export function HistoryView({
  token,
  deviceId,
  model,
  onRefresh
}: {
  token: string;
  deviceId: string;
  model: DashboardViewModel;
  onRefresh: () => Promise<void>;
}) {
  const [range, setRange] = useState<Range>("1H");
  const [modal, setModal] = useState<MetricKey | null>(null);
  const limit = rangeLimit[range];
  const tempValues = numericSeries(model.readings, "temperature", limit);
  const humidValues = numericSeries(model.readings, "humidity", limit);
  const lightValues = numericSeries(model.readings, "lightness", limit);
  const activeModal = modal ? metricMeta[modal] : undefined;
  const modalValues = modal === "temp" ? tempValues : modal === "humid" ? humidValues : lightValues;

  async function refreshAgent() {
    await api.createReport(token, deviceId);
    await onRefresh();
  }

  return (
    <section id="view-data" className="view-section active">
      <div className="data-dashboard">
        <div className="data-col">
          <div className="col-header"><div className="col-title"><Gauge width={14} height={14} />实时数据</div><div className="col-meta">{model.selectedDevice?.name ?? "ROVER-01"} · {model.lastDataAt}</div></div>
          <div className="metric-cards">
            <div className="metric-card m-temp">
              <div className="m-header"><span className="m-label"><Thermometer className="m-icon" width={14} height={14} />温度</span><span className="m-status">{(model.temperature ?? 0) > 32 ? "偏高" : "正常"}</span></div>
              <div className="m-body"><span className="m-val orange">{model.temperature?.toFixed(1) ?? "--"}</span><span className="m-unit">°C</span></div>
            </div>
            <div className="metric-card m-humid">
              <div className="m-header"><span className="m-label"><Droplets className="m-icon" width={14} height={14} />湿度</span><span className="m-status">{(model.humidity ?? 0) > 80 ? "预警" : "正常"}</span></div>
              <div className="m-body"><span className="m-val">{model.humidity?.toFixed(1) ?? "--"}</span><span className="m-unit">%RH</span></div>
            </div>
            <div className="metric-card m-light">
              <div className="m-header"><span className="m-label"><Sun className="m-icon" width={14} height={14} />光照</span><span className="m-status">正常</span></div>
              <div className="m-body"><span className="m-val">{model.lightness?.toFixed(0) ?? "--"}</span><span className="m-unit">lx</span></div>
            </div>
          </div>
        </div>

        <div className="data-col">
          <div className="col-header">
            <div className="col-title"><TrendingUp width={14} height={14} />历史趋势</div>
            <div className="time-toggles">
              {(["1H", "24H", "7D"] as const).map((item) => <button key={item} className={range === item ? "time-btn active" : "time-btn"} onClick={() => setRange(item)}>{item}</button>)}
            </div>
          </div>
          <div className="charts-stack">
            <button onClick={() => setModal("temp")}><TrendChart values={tempValues} color={metricMeta.temp.color} label={metricMeta.temp.label} /></button>
            <button onClick={() => setModal("humid")}><TrendChart values={humidValues} color={metricMeta.humid.color} label={metricMeta.humid.label} /></button>
            <button onClick={() => setModal("light")}><TrendChart values={lightValues} color={metricMeta.light.color} label={metricMeta.light.label} /></button>
          </div>
        </div>

        <div className="data-col">
          <div className="col-header"><div className="col-title"><Sparkles width={14} height={14} />智能分析</div><button className="panel-action" onClick={refreshAgent}><Bot width={12} height={12} />刷新</button></div>
          <div className="agent-panel">
            <div className="agent-header"><div className="col-title agent-title"><Bot width={14} height={14} />Agent 摘要</div><RiskBadge level={model.risk.level} label={model.risk.label} /></div>
            <div className="agent-desc">{model.risk.summary}</div>
            <div className="evidence-grid">
              {(model.risk.suggestions.length ? model.risk.suggestions : ["等待更多环境数据", `RSSI ${model.rssi ?? "--"} dBm`, `弱网缓存 ${model.cachedCount} 条`]).map((item) => <span className="ev-tag" key={item}>{item}</span>)}
            </div>
          </div>
          <div className="link-status-box">
            <div className="ls-row"><span className="ls-label"><RadioTower width={14} height={14} />H3863 基站</span><span className={model.base?.status === "online" ? "ls-val online" : "ls-val"}>{model.base?.status === "online" ? "在线" : "未知"}</span></div>
            <div className="ls-row"><span className="ls-label"><Cloud width={14} height={14} />云端同步</span><span className={model.base?.network_status === "cloud-online" ? "ls-val online" : "ls-val"}>{model.base?.network_status ?? "--"}</span></div>
            <div className="ls-row"><span className="ls-label"><Database width={14} height={14} />缓存积压</span><span className={model.cachedCount > 0 ? "ls-val warn" : "ls-val online"}>{model.cachedCount} 条</span></div>
            <div className="ls-row"><span className="ls-label"><Activity width={14} height={14} />SLE RSSI</span><span className="ls-val">{model.rssi ?? "--"} dBm</span></div>
          </div>
        </div>
      </div>

      <ChartModal open={Boolean(activeModal)} title={activeModal?.title ?? ""} subtitle={`时间范围 ${range}`} values={modalValues} color={activeModal?.color ?? "var(--color-cyan)"} onClose={() => setModal(null)} />
    </section>
  );
}
