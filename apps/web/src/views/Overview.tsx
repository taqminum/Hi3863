import { Activity, AlertTriangle, Cloud, Cpu, Droplets, RadioTower, Smartphone, Sun, Thermometer } from "lucide-react";
import { useState } from "react";
import { ChartModal, OverviewDataCard, RiskBadge } from "../components/Primitives";
import { numericSeries, type DashboardViewModel } from "../viewModels";

type MetricKey = "signal" | "temp" | "humid" | "light";

const metricMeta = {
  signal: { title: "SLE 信号质量", subtitle: "最近链路 RSSI 趋势", color: "var(--color-cyan)" },
  temp: { title: "环境温度", subtitle: "最近温度采样趋势", color: "var(--color-orange)" },
  humid: { title: "环境湿度", subtitle: "最近湿度采样趋势", color: "var(--color-cyan-blue)" },
  light: { title: "环境光照", subtitle: "最近光照采样趋势", color: "var(--color-gold)" }
};

export function Overview({ model }: { model: DashboardViewModel }) {
  const [modal, setModal] = useState<MetricKey | null>(null);
  const signalValues = numericSeries(model.readings, "rssi", 24);
  const tempValues = numericSeries(model.readings, "temperature", 24);
  const humidValues = numericSeries(model.readings, "humidity", 24);
  const lightValues = numericSeries(model.readings, "lightness", 24);
  const activeModal = modal ? metricMeta[modal] : undefined;
  const modalValues = modal === "signal" ? signalValues : modal === "temp" ? tempValues : modal === "humid" ? humidValues : lightValues;
  const baseOnline = model.base?.status === "online";
  const deviceOnline = model.selectedDevice?.status === "online";
  const weakSignal = (model.rssi ?? -45) < -75;
  const humidityWarning = (model.humidity ?? 0) >= 80;

  return (
    <section id="view-overview" className="view-section active">
      <div className="dash-top-row">
        <div className="topology-card">
          <div className="node active"><div className="node-icon"><Smartphone /></div><span className="node-label">App 端</span></div>
          <div className="link-line link-active" />
          <div className="node active"><div className="node-icon"><Cloud /></div><span className="node-label">云服务器</span></div>
          <div className="link-line link-active"><span className="link-label">TCP</span></div>
          <div className={baseOnline ? "node active" : "node"}><div className="node-icon"><RadioTower /></div><span className="node-label">{model.base?.name ?? "H3863 基站"}</span></div>
          <div className={weakSignal ? "link-line link-warning" : "link-line link-active"}><span className="link-label">{weakSignal ? "SLE弱网" : "SLE"}</span></div>
          <div className={deviceOnline ? "node active node-warn" : "node node-warn"}><div className="node-icon"><Cpu /></div><span className="node-label">{model.selectedDevice?.name ?? "小车节点"}</span></div>
        </div>

        <div className="risk-card">
          <AlertTriangle className="risk-icon" width={20} height={20} />
          <div className="risk-content">
            <div className="risk-card-title">智能风险评估</div>
            <p>{model.risk.summary}</p>
            <div className="risk-card-foot">
              <RiskBadge level={model.risk.level} label={model.risk.label} />
              <span>{model.risk.time}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="data-grid">
        <OverviewDataCard icon={Activity} label="SLE 信号质量" value={model.rssi === undefined ? "--" : String(model.rssi)} unit="dBm" status={weakSignal ? "弱网" : "正常"} tone={weakSignal ? "warning" : "highlight"} values={signalValues} onClick={() => setModal("signal")} />
        <OverviewDataCard icon={Thermometer} label="环境温度" value={model.temperature === undefined ? "--" : model.temperature.toFixed(1)} unit="°C" status={(model.temperature ?? 0) > 32 ? "偏高" : "正常"} tone={(model.temperature ?? 0) > 32 ? "warning" : undefined} values={tempValues} onClick={() => setModal("temp")} />
        <OverviewDataCard icon={Droplets} label="环境湿度" value={model.humidity === undefined ? "--" : model.humidity.toFixed(1)} unit="%RH" status={humidityWarning ? "预警" : "正常"} tone={humidityWarning ? "warning" : undefined} values={humidValues} onClick={() => setModal("humid")} />
        <OverviewDataCard icon={Sun} label="环境光照" value={model.lightness === undefined ? "--" : model.lightness.toFixed(0)} unit="lx" status="正常" values={lightValues} onClick={() => setModal("light")} />
      </div>

      <div className="overview-bottom">
        <div className="od-panel">
          <div className="panel-header"><span>最近闭环状态</span></div>
          <div className="status-summary">
            <div className="status-row"><span className="status-label">最近命令</span><span className="status-val">{model.latestCommand}</span></div>
            <div className="status-row"><span className="status-label">最近巡检</span><span className="status-val">{model.latestTask}</span></div>
            <div className="status-row"><span className="status-label">最近数据</span><span className="status-val">{model.lastDataAt}</span></div>
            <div className="status-row"><span className="status-label">弱网缓存</span><span className={model.cachedCount > 0 ? "status-val warn" : "status-val online"}>{model.cachedCount} 条</span></div>
          </div>
        </div>
        <div className="od-panel">
          <div className="panel-header"><span>Agent 建议</span></div>
          <div className="evidence-grid">
            {(model.risk.suggestions.length ? model.risk.suggestions : ["等待更多环境数据", "保持基站云端在线"]).map((item) => <span className="ev-tag" key={item}>{item}</span>)}
          </div>
        </div>
      </div>

      <ChartModal open={Boolean(activeModal)} title={activeModal?.title ?? ""} subtitle={activeModal?.subtitle ?? ""} values={modalValues} color={activeModal?.color ?? "var(--color-cyan)"} onClose={() => setModal(null)} />
    </section>
  );
}
