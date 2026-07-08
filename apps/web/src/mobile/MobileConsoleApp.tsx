import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "../api";
import type { ConnectionMode } from "../App";
import { buildDrivePayload, localTelemetryToReading, type LocalTelemetrySample } from "../carProtocol";
import { localCarApi } from "../localCarApi";
import { Login } from "../views/Login";
import prototypeHtml from "../open-design/ws63e-inspection-app-full-8.html?raw";
import {
  buildMobileOpenDesignSnapshot,
  buildMobileOpenDesignSrcDoc,
  type HostToMobileOpenDesignMessage,
  type MobileOpenDesignToHostMessage
} from "./mobileOpenDesign";
import { defaultMobileConnectionMode, mobileSessionAllowsLocalControl, shouldPollLocalTelemetry } from "./mobileSession";

const mobileFallbackDevice: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E-巡检车-01",
  base_station_id: "sle-base-001",
  status: "online",
  connection_mode: "sle",
  direct_url: "",
  last_seen: new Date(0).toISOString(),
  remark: "APK 横屏控制台默认设备"
};

const mobileLocalUser: User = {
  id: "local-field-operator",
  username: "local",
  displayName: "本地联调",
  role: "operator"
};

function readStoredUser(): User | null {
  const raw = localStorage.getItem("ws63-user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem("ws63-user");
    return null;
  }
}

export function MobileConsoleApp() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastLocalControlAtRef = useRef(0);
  const srcDoc = useMemo(() => buildMobileOpenDesignSrcDoc(prototypeHtml), []);
  const [token, setToken] = useState(() => localStorage.getItem("ws63-token"));
  const [connectionMode] = useState<ConnectionMode>(() => defaultMobileConnectionMode(localStorage.getItem("ws63-connection-mode")));
  const [user, setUser] = useState<User | null>(() => readStoredUser() ?? (connectionMode === "local" ? mobileLocalUser : null));
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [baseStations, setBaseStations] = useState<BaseStationRecord[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [commands, setCommands] = useState<ControlCommand[]>([]);
  const [tasks, setTasks] = useState<PatrolTask[]>([]);
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("ws63-car-001");
  const [notice, setNotice] = useState("");
  const [localSamples, setLocalSamples] = useState<LocalTelemetrySample[]>([]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0] ?? mobileFallbackDevice;
  const activeReadings = connectionMode === "local" ? localSamples.map(localTelemetryToReading) : readings;

  const logout = useCallback(() => {
    localStorage.removeItem("ws63-token");
    localStorage.removeItem("ws63-user");
    setToken(null);
    setUser(connectionMode === "local" ? mobileLocalUser : null);
  }, [connectionMode]);

  const guarded = useCallback(async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      setNotice(error instanceof Error ? error.message : "请求失败");
    }
  }, [logout]);

  const refresh = useCallback(async (nextToken = token, nextDeviceId = selectedDeviceId) => {
    if (!nextToken || connectionMode === "local") return;
    const dashboard = await api.dashboard(nextToken, nextDeviceId);
    setDevices(dashboard.devices);
    setBaseStations(dashboard.baseStations);
    setReadings(dashboard.readings);
    setCommands(dashboard.recentCommands);
    setTasks(dashboard.recentTasks);
    setReports(dashboard.agentReports);
    if (dashboard.devices[0] && !dashboard.devices.some((device) => device.id === nextDeviceId)) {
      setSelectedDeviceId(dashboard.devices[0].id);
    }
    if (user?.role === "admin") {
      setAudits((await api.audits(nextToken)).logs);
    }
  }, [connectionMode, selectedDeviceId, token, user?.role]);

  useEffect(() => {
    void guarded(() => refresh());
  }, [guarded, refresh]);

  useEffect(() => {
    if (connectionMode !== "local") return;
    let cancelled = false;
    async function pollLocalCar() {
      if (!shouldPollLocalTelemetry(Date.now(), lastLocalControlAtRef.current)) return;
      try {
        const sample = await localCarApi.telemetry();
        if (!cancelled) {
          setLocalSamples((current) => [...current.slice(-119), sample]);
          setNotice("");
        }
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
  }, [connectionMode]);

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
    events.onerror = () => setNotice("实时连接暂时中断，正在等待自动重连");
    return () => events.close();
  }, [connectionMode, guarded, refresh, selectedDeviceId, token]);

  const snapshot = useMemo(() => {
    if (!user) return null;
    return buildMobileOpenDesignSnapshot({
      user,
      connectionMode,
      selectedDevice,
      devices,
      baseStations,
      readings: activeReadings,
      commands,
      tasks,
      reports,
      audits,
      notice
    });
  }, [activeReadings, audits, baseStations, commands, connectionMode, devices, notice, reports, selectedDevice, tasks, user]);

  const postSnapshot = useCallback(() => {
    if (!snapshot) return;
    const message: HostToMobileOpenDesignMessage = {
      source: "ws63-mobile-host",
      type: "snapshot",
      payload: snapshot
    };
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, [snapshot]);

  useEffect(() => {
    postSnapshot();
  }, [postSnapshot]);

  const handleBridgeMessage = useCallback(async (message: MobileOpenDesignToHostMessage) => {
    if (!mobileSessionAllowsLocalControl(connectionMode, token)) return;
    if (message.type === "ready") {
      postSnapshot();
      return;
    }
    if (message.type === "logout") {
      logout();
      return;
    }
    await guarded(async () => {
      if (message.type === "drive") {
        if (connectionMode === "local") {
          lastLocalControlAtRef.current = Date.now();
          await localCarApi.send(buildDrivePayload({ left: message.left, right: message.right }, message.durationMs));
        } else {
          if (!token) return;
          await api.command(token, {
            deviceId: selectedDevice.id,
            baseStationId: selectedDevice.base_station_id,
            action: "drive",
            speed: message.speed,
            left: message.left,
            right: message.right,
            durationMs: message.durationMs
          });
        }
        return;
      }
      if (message.type === "stop") {
        if (connectionMode === "local") {
          lastLocalControlAtRef.current = Date.now();
          await localCarApi.send({ cmd: "stop", speed: 0, duration_ms: 0 });
        } else {
          if (!token) return;
          await api.command(token, {
            deviceId: selectedDevice.id,
            baseStationId: selectedDevice.base_station_id,
            action: "stop",
            speed: 0
          });
        }
        return;
      }
      if (message.type === "create-patrol") {
        if (connectionMode === "local") {
          setNotice("本地联调模式暂不创建云端巡检任务");
          return;
        }
        if (!token) return;
        await api.createPatrol(token, {
          deviceId: selectedDevice.id,
          baseStationId: selectedDevice.base_station_id,
          name: "APK 标准巡检",
          steps: [
            { action: "drive", left: 50, right: 50, durationMs: 1200 },
            { action: "drive", left: 35, right: -35, durationMs: 500 },
            { action: "drive", left: 45, right: 45, durationMs: 1000 },
            { action: "stop", durationMs: 0 }
          ]
        });
        await refresh();
        return;
      }
      if (message.type === "refresh-agent") {
        if (connectionMode === "local") {
          setNotice("本地联调模式暂不生成云端 Agent 报告");
          return;
        }
        if (!token) return;
        await api.createReport(token, selectedDevice.id);
        await refresh();
      }
    });
  }, [connectionMode, guarded, logout, postSnapshot, refresh, selectedDevice.base_station_id, selectedDevice.id, token]);

  useEffect(() => {
    function onMessage(event: MessageEvent<MobileOpenDesignToHostMessage>) {
      const message = event.data;
      if (!message || message.source !== "ws63-mobile-open-design") return;
      void handleBridgeMessage(message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleBridgeMessage]);

  if (connectionMode !== "local" && (!token || !user)) {
    return <Login onLogin={(nextToken, nextUser) => {
      localStorage.setItem("ws63-token", nextToken);
      localStorage.setItem("ws63-user", JSON.stringify(nextUser));
      setToken(nextToken);
      setUser(nextUser);
    }} />;
  }

  return (
    <iframe
      ref={frameRef}
      title="WS63E mobile console"
      className="mobile-open-design-frame"
      srcDoc={srcDoc}
      onLoad={postSnapshot}
    />
  );
}
