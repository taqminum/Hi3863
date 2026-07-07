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
import { AgentView } from "./views/AgentView";
import { AuditView } from "./views/AuditView";
import { BackendDebug } from "./views/BackendDebug";
import { Control } from "./views/Control";
import { DeviceView } from "./views/DeviceView";
import { HistoryView } from "./views/HistoryView";
import { Login } from "./views/Login";
import { Overview } from "./views/Overview";
import { Patrol } from "./views/Patrol";
import type { Tab } from "./views";

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

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0];
  const latest = readings.at(-1);

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
    if (!nextToken) return;
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
  }, [token, selectedDeviceId, user?.role]);

  useEffect(() => {
    if (!token) return;
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
  }, [token, selectedDeviceId]);

  if (!token || !user) {
    return <Login onLogin={(nextToken, nextUser) => {
      localStorage.setItem("ws63-token", nextToken);
      localStorage.setItem("ws63-user", JSON.stringify(nextUser));
      setToken(nextToken);
      setUser(nextUser);
    }} />;
  }

  return (
    <Shell
      user={user}
      tab={tab}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      notice={notice}
      onTabChange={setTab}
      onDeviceChange={setSelectedDeviceId}
      onClearNotice={() => setNotice("")}
      onLogout={logout}
    >
      {tab === "overview" && <Overview latest={latest} reports={reports} devices={devices} baseStations={baseStations} commands={commands} tasks={tasks} />}
      {tab === "control" && <Control token={token} device={selectedDevice} commands={commands} onNotice={setNotice} onRefresh={() => guarded(() => refresh())} />}
      {tab === "patrol" && <Patrol token={token} device={selectedDevice} tasks={tasks} onRefresh={() => guarded(() => refresh())} onNotice={setNotice} />}
      {tab === "history" && <HistoryView readings={readings} />}
      {tab === "agent" && <AgentView token={token} deviceId={selectedDeviceId} reports={reports} onRefresh={() => guarded(() => refresh())} />}
      {tab === "devices" && <DeviceView token={token} role={user.role} devices={devices} baseStations={baseStations} onNotice={setNotice} onRefresh={() => guarded(() => refresh())} />}
      {tab === "audit" && <AuditView audits={audits} />}
      {tab === "debug" && <BackendDebug token={token} device={selectedDevice} onNotice={setNotice} onRefresh={() => guarded(() => refresh())} />}
    </Shell>
  );
}
