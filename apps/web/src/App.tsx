import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  apiBaseUrl,
  type AgentReport,
  type AuditLog,
  type BaseStationRecord,
  type ControlCommand,
  type DeviceRecord,
  type PatrolTask,
  type Reading,
  type User
} from "./api";
import { Shell } from "./components/Shell";
import { Control } from "./views/Control";
import { DeviceView } from "./views/DeviceView";
import { HistoryView } from "./views/HistoryView";
import { Login } from "./views/Login";
import { Overview } from "./views/Overview";
import { Patrol } from "./views/Patrol";
import type { Tab } from "./views";
import { localTelemetryToReading, type LocalTelemetrySample } from "./carProtocol";
import { getLocalCarUrl, localCarApi, setLocalCarUrl } from "./localCarApi";
import { buildDashboardViewModel } from "./viewModels";

export type ConnectionMode = "cloud" | "local";

const localFallbackDevice: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63 本地小车",
  base_station_id: "local-car-softap",
  status: "online",
  connection_mode: "wifi-softap",
  direct_url: "http://192.168.5.1:8080",
  last_seen: new Date(0).toISOString(),
  remark: "本地 SoftAP 验收设备"
};

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("ws63-token"));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("ws63-user");
    return raw ? JSON.parse(raw) as User : null;
  });
  const [tab, setTab] = useState<Tab>("overview");
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [baseStations, setBaseStations] = useState<BaseStationRecord[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [commands, setCommands] = useState<ControlCommand[]>([]);
  const [tasks, setTasks] = useState<PatrolTask[]>([]);
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("ws63-car-001");
  const [notice, setNotice] = useState("");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() => localStorage.getItem("ws63-connection-mode") === "local" ? "local" : "cloud");
  const [localCarUrl, setLocalCarUrlState] = useState(getLocalCarUrl());
  const [localSamples, setLocalSamples] = useState<LocalTelemetrySample[]>([]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0] ?? (connectionMode === "local" ? localFallbackDevice : undefined);
  const activeReadings = connectionMode === "local" ? localSamples.map(localTelemetryToReading) : readings;

  function changeConnectionMode(mode: ConnectionMode) {
    localStorage.setItem("ws63-connection-mode", mode);
    setConnectionMode(mode);
    if (mode === "local") setSelectedDeviceId(localFallbackDevice.id);
    setNotice(mode === "local" ? "已切换到本地小车模式，请连接 WS63E_ENV_CAR 热点" : "已切换到云端基站模式");
  }

  function changeLocalCarUrl(value: string) {
    setLocalCarUrl(value);
    setLocalCarUrlState(value.replace(/\/$/, ""));
  }

  function logout() {
    localStorage.removeItem("ws63-token");
    localStorage.removeItem("ws63-user");
    setToken(null);
    setUser(null);
  }

  async function guarded(task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setNotice(error instanceof Error ? error.message : "请求失败");
    }
  }

  async function refresh(nextToken = token, nextDeviceId = selectedDeviceId) {
    if (!nextToken || connectionMode === "local") return;
    const dashboard = await api.dashboard(nextToken, nextDeviceId);
    setDevices(dashboard.devices);
    setBaseStations(dashboard.baseStations);
    setReadings(dashboard.readings);
    setCommands(dashboard.recentCommands);
    setTasks(dashboard.recentTasks);
    setReports(dashboard.agentReports);
    if (user?.role === "admin") {
      setAudits((await api.audits(nextToken)).logs);
    }
  }

  useEffect(() => {
    void guarded(() => refresh());
  }, [token, selectedDeviceId, user?.role, connectionMode]);

  useEffect(() => {
    if (connectionMode !== "local") return;
    let cancelled = false;
    async function pollLocalCar() {
      try {
        const sample = await localCarApi.telemetry();
        if (cancelled) return;
        setLocalSamples((current) => [...current.slice(-119), sample]);
        setNotice("");
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? `本地小车连接失败：${error.message}` : "本地小车连接失败");
      }
    }
    void pollLocalCar();
    const timer = window.setInterval(() => void pollLocalCar(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectionMode, localCarUrl]);

  useEffect(() => {
    if (!token || connectionMode === "local") return;
    const events = new EventSource(`${apiBaseUrl()}/api/events?token=${encodeURIComponent(token)}`);
    events.addEventListener("telemetry", (event) => {
      const payload = JSON.parse((event as MessageEvent).data).data as { readings: Reading[]; report: AgentReport };
      setReadings((current) => [...current.slice(-150), ...payload.readings.filter((reading) => reading.deviceId === selectedDeviceId)]);
      setReports((current) => [payload.report, ...current].slice(0, 20));
      void guarded(() => refresh());
    });
    events.addEventListener("command", () => void guarded(() => refresh()));
    events.addEventListener("patrol", () => void guarded(() => refresh()));
    events.addEventListener("device", () => void guarded(() => refresh()));
    events.onerror = () => setNotice("实时连接暂时中断，浏览器会自动重连");
    return () => events.close();
  }, [token, selectedDeviceId, connectionMode]);

  if (!token || !user) {
    return <Login onLogin={(nextToken, nextUser) => {
      localStorage.setItem("ws63-token", nextToken);
      localStorage.setItem("ws63-user", JSON.stringify(nextUser));
      setToken(nextToken);
      setUser(nextUser);
    }} />;
  }

  const model = buildDashboardViewModel({
    user,
    connectionMode,
    selectedDevice,
    devices,
    baseStations,
    readings: activeReadings,
    commands,
    tasks,
    reports,
    audits
  });

  return (
    <Shell
      user={user}
      tab={tab}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      notice={notice}
      connectionMode={connectionMode}
      localCarUrl={localCarUrl}
      onTabChange={setTab}
      onDeviceChange={setSelectedDeviceId}
      onConnectionModeChange={changeConnectionMode}
      onLocalCarUrlChange={changeLocalCarUrl}
      onClearNotice={() => setNotice("")}
      onLogout={logout}
    >
      {tab === "overview" && <Overview model={model} />}
      {tab === "control" && <Control token={token} connectionMode={connectionMode} device={selectedDevice} commands={commands} onNotice={setNotice} onRefresh={() => guarded(() => refresh())} />}
      {tab === "tasks" && <Patrol token={token} role={user.role} device={selectedDevice} tasks={tasks} model={model} onRefresh={() => guarded(() => refresh())} onNotice={setNotice} />}
      {tab === "data" && <HistoryView token={token} deviceId={selectedDeviceId} model={model} onRefresh={() => guarded(() => refresh())} />}
      {tab === "manage" && <DeviceView token={token} model={model} onNotice={setNotice} onRefresh={() => guarded(() => refresh())} />}
    </Shell>
  );
}
