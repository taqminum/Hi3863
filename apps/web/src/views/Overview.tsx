import type { AgentReport, BaseStationRecord, ControlCommand, DeviceRecord, PatrolTask, Reading } from "../api";
import { Chart, Metric, RiskBadge, StatusRow } from "../components/Primitives";
import { formatTime, normalizeReport } from "../utils";

export function Overview({
  latest,
  readings,
  reports,
  devices,
  baseStations,
  commands,
  tasks
}: {
  latest?: Reading;
  readings: Reading[];
  reports: AgentReport[];
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  commands: ControlCommand[];
  tasks: PatrolTask[];
}) {
  const report = normalizeReport(reports[0]);
  const latestCommand = commands[0];
  const latestTask = tasks[0];
  const base = baseStations[0];
  const rssi = latest?.rssi ?? base?.last_rssi;
  const cachedCount = latest?.cachedCount ?? base?.cached_count ?? 0;

  return (
    <>
      <section className="metric-grid">
        <Metric label="温度" value={latest ? `${latest.temperature.toFixed(1)}°C` : "--"} tone="warm" />
        <Metric label="湿度" value={latest ? `${latest.humidity.toFixed(1)}%` : "--"} tone="cool" />
        <Metric label="SLE RSSI" value={rssi === undefined ? "--" : `${rssi} dBm`} tone={(rssi ?? -45) < -75 ? "danger" : "ok"} />
        <Metric label="弱网缓存" value={`${cachedCount} 条`} tone={cachedCount > 0 ? "danger" : "ok"} />
      </section>

      <section className="split">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>环境趋势</h2>
              <p className="muted">总览页直接观察最近采样曲线，便于验收实时链路。</p>
            </div>
          </div>
          <div className="overview-charts">
            <Chart readings={readings} field="temperature" color="#ff6b4a" label="温度" />
            <Chart readings={readings} field="humidity" color="#00e6a8" label="湿度" />
            <Chart readings={readings} field="lightness" color="#f6c85f" label="光照" />
          </div>
        </div>
        <div className="panel agent-panel">
          <div className="panel-head">
            <div>
              <h2>作品状态</h2>
              <p className="muted">设备、基站、控制命令和 Agent 风险闭环。</p>
            </div>
            <RiskBadge level={report.level} />
          </div>
          <p>{report.summary}</p>
          <div className="compact-list">
            <span>最近命令：{latestCommand ? `${latestCommand.payload} / ${latestCommand.status}` : "--"}</span>
            <span>最近巡检：{latestTask ? `${latestTask.name} / ${latestTask.status}` : "--"}</span>
            <span>最近数据：{formatTime(latest?.recordedAt)}</span>
          </div>
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h2>基站链路</h2>
          <div className="status-list">
            {baseStations.length === 0 && <p className="muted">等待云端返回基站状态。</p>}
            {baseStations.map((item) => (
              <StatusRow key={item.id} name={item.name} status={`${item.status} / ${item.network_status}`} time={item.last_heartbeat} />
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>车辆设备</h2>
          <div className="status-list">
            {devices.length === 0 && <p className="muted">等待设备接入。</p>}
            {devices.map((device) => (
              <StatusRow key={device.id} name={device.name} status={`${device.status} / ${device.connection_mode}`} time={device.last_seen} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
