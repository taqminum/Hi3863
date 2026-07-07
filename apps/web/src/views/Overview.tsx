import type { BaseStationRecord, ControlCommand, DeviceRecord, PatrolTask, Reading } from "../api";
import { Metric, RiskBadge, StatusRow } from "../components/Primitives";
import { formatTime, normalizeReport } from "../utils";
import type { AgentReport } from "../api";

export function Overview({
  latest,
  reports,
  devices,
  baseStations,
  commands,
  tasks
}: {
  latest?: Reading;
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
  return (
    <>
      <section className="metric-grid">
        <Metric label="温度" value={latest ? `${latest.temperature.toFixed(1)}°C` : "--"} tone="warm" />
        <Metric label="湿度" value={latest ? `${latest.humidity.toFixed(1)}%` : "--"} tone="cool" />
        <Metric label="SLE RSSI" value={`${latest?.rssi ?? base?.last_rssi ?? "--"} dBm`} tone={(latest?.rssi ?? base?.last_rssi ?? -45) < -75 ? "danger" : "ok"} />
        <Metric label="弱网缓存" value={`${latest?.cachedCount ?? base?.cached_count ?? 0} 条`} tone={(latest?.cachedCount ?? base?.cached_count ?? 0) > 0 ? "danger" : "ok"} />
      </section>

      <section className="split">
        <div className="panel">
          <h2>设备链路</h2>
          <div className="status-list">
            {baseStations.map((item) => (
              <StatusRow key={item.id} name={item.name} status={`${item.status} · ${item.network_status}`} time={item.last_heartbeat} />
            ))}
            {devices.map((device) => (
              <StatusRow key={device.id} name={device.name} status={`${device.status} · ${device.connection_mode}`} time={device.last_seen} />
            ))}
          </div>
        </div>
        <div className="panel agent-panel">
          <h2>作品状态</h2>
          <RiskBadge level={report.level} />
          <p>{report.summary}</p>
          <div className="compact-list">
            <span>最近命令：{latestCommand ? `${latestCommand.payload} · ${latestCommand.status}` : "--"}</span>
            <span>最近巡检：{latestTask ? `${latestTask.name} · ${latestTask.status}` : "--"}</span>
            <span>最近数据：{formatTime(latest?.recordedAt)}</span>
          </div>
        </div>
      </section>
    </>
  );
}
