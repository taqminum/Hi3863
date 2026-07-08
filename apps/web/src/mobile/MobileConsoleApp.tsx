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
import { connectionNotice, normalizeConnectionMode } from "../connectionModes";
import { buildCompatPayloadFromWheels, localTelemetryToReading, type LocalTelemetrySample } from "../carProtocol";
import { gatewayApi, gatewayTelemetryToReading, type GatewayTelemetrySample } from "../gatewayApi";
import { historyCache } from "../historyCache";
import { summarizeReadingsForAgent, type CachedReading, type ReadingSource } from "../historySeries";
import { localCarApi } from "../localCarApi";
import type { ConnectionMode } from "../types";
import { Login } from "../views/Login";
import prototypeHtml from "../open-design/ws63e-inspection-app-full-8.html?raw";
import {
  buildMobileOpenDesignSnapshot,
  buildMobileOpenDesignSrcDoc,
  type HostToMobileOpenDesignMessage,
  type MobileHistoryRange,
  type MobileOpenDesignToHostMessage
} from "./mobileOpenDesign";

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

const gatewayFallbackDevice: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E 环境巡检小车 001",
  base_station_id: "sle-base-001",
  status: "online",
  connection_mode: "sle-gateway",
  direct_url: "udp://192.168.6.1:8888",
  last_seen: new Date(0).toISOString(),
  remark: "BearPi 星闪基站 Wi-Fi UDP"
};

const carDirectFallbackDevice: DeviceRecord = {
  id: "ws63-car-001",
  name: "WS63E 小车直连",
  base_station_id: "local-car-softap",
  status: "online",
  connection_mode: "wifi-softap",
  direct_url: "http://192.168.5.1:8080",
  last_seen: new Date(0).toISOString(),
  remark: "小车 SoftAP HTTP 兜底"
};

function historyRangeMs(range: MobileHistoryRange): number {
  if (range === "7D") return 7 * 24 * 60 * 60 * 1000;
  if (range === "24H") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function historyRangeLimit(range: MobileHistoryRange): number {
  if (range === "7D") return 5000;
  if (range === "24H") return 2400;
  return 1000;
}

function mergeReadingsById(...groups: Reading[][]): Reading[] {
  const byId = new Map<string, Reading>();
  for (const reading of groups.flat()) {
    byId.set(reading.id, reading);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
}

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
  const srcDoc = useMemo(() => buildMobileOpenDesignSrcDoc(prototypeHtml), []);
  const [token, setToken] = useState(() => localStorage.getItem("ws63-token"));
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [baseStations, setBaseStations] = useState<BaseStationRecord[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [commands, setCommands] = useState<ControlCommand[]>([]);
  const [tasks, setTasks] = useState<PatrolTask[]>([]);
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("ws63-car-001");
  const [notice, setNotice] = useState("");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() => normalizeConnectionMode(localStorage.getItem("ws63-connection-mode")));
  const [historyRange, setHistoryRange] = useState<MobileHistoryRange>("1H");
  const [localSamples, setLocalSamples] = useState<LocalTelemetrySample[]>([]);
  const [gatewaySamples, setGatewaySamples] = useState<GatewayTelemetrySample[]>([]);
  const [cachedReadings, setCachedReadings] = useState<CachedReading[]>([]);

  const fallbackDevice = connectionMode === "gateway" ? gatewayFallbackDevice : connectionMode === "car-direct" ? carDirectFallbackDevice : mobileFallbackDevice;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? devices[0] ?? fallbackDevice;
  const liveReadings = connectionMode === "gateway"
    ? gatewaySamples.map(gatewayTelemetryToReading)
    : connectionMode === "car-direct"
      ? localSamples.map(localTelemetryToReading)
      : readings;
  const activeReadings = cachedReadings.length > 0 ? cachedReadings : liveReadings;

  const logout = useCallback(() => {
    localStorage.removeItem("ws63-token");
    localStorage.removeItem("ws63-user");
    setToken(null);
    setUser(null);
  }, []);

  const rangeForCache = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - historyRangeMs(historyRange));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [historyRange]);

  const reloadCache = useCallback(async (deviceId = selectedDeviceId) => {
    const range = rangeForCache();
    setCachedReadings(await historyCache.load({ deviceId, ...range }));
  }, [rangeForCache, selectedDeviceId]);

  useEffect(() => {
    void reloadCache();
  }, [connectionMode, reloadCache]);

  const saveReadings = useCallback(async (source: ReadingSource, nextReadings: Reading[]) => {
    await historyCache.save(source, nextReadings);
    await reloadCache(nextReadings[0]?.deviceId ?? selectedDeviceId);
  }, [reloadCache, selectedDeviceId]);

  const changeConnectionMode = useCallback((mode: ConnectionMode) => {
    localStorage.setItem("ws63-connection-mode", mode);
    setConnectionMode(mode);
    setNotice(connectionNotice(mode));
  }, []);

  function localAgentReport(inputReadings: Reading[], source: string): AgentReport {
    const range = rangeForCache();
    const summary = summarizeReadingsForAgent(inputReadings, { ...range, maxPoints: 80 });
    const gapCount = summary.missingIntervals.length;
    const temp = summary.stats.temperature;
    const riskLevel = gapCount > 0 || (temp.max ?? 0) >= 30 ? "medium" : "low";
    return {
      riskLevel,
      summary: `本地规则分析：${source} 数据 ${summary.points.length} 点，温度 ${temp.min ?? "--"}-${temp.max ?? "--"}°C，缺口 ${gapCount} 段。`,
      suggestions: gapCount > 0 ? ["曲线空白表示该时间段手机未收到数据，请检查基站或小车链路。"] : ["当前缓存数据连续，建议继续观察趋势。"],
      evidence: summary.missingIntervals.map((gap) => ({ code: "data_gap", label: "数据缺口", value: `${Math.round(gap.durationMs / 1000)}s` }))
    };
  }

  const guarded = useCallback(async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (token?.startsWith("local-demo:")) {
          setNotice("本地演示会话不能访问云端接口，请切换到基站或小车直连。");
          return;
        }
        logout();
        return;
      }
      if (error instanceof ApiError && error.status === 0 && connectionMode === "cloud") {
        changeConnectionMode("gateway");
        setNotice("云服务器暂时不可达，已尝试切换到星闪基站 Wi-Fi。");
        return;
      }
      setNotice(error instanceof Error ? error.message : "请求失败");
    }
  }, [changeConnectionMode, connectionMode, logout, token]);

  const refresh = useCallback(async (nextToken = token, nextDeviceId = selectedDeviceId) => {
    if (!nextToken || connectionMode !== "cloud") return;
    const dashboard = await api.dashboard(nextToken, nextDeviceId);
    const range = rangeForCache();
    const history = await api.readings(nextToken, nextDeviceId, {
      ...range,
      limit: historyRangeLimit(historyRange)
    });
    const mergedReadings = mergeReadingsById(history.readings, dashboard.readings);
    setDevices(dashboard.devices);
    setBaseStations(dashboard.baseStations);
    setReadings(mergedReadings);
    await saveReadings("cloud", mergedReadings);
    setCommands(dashboard.recentCommands);
    setTasks(dashboard.recentTasks);
    setReports(dashboard.agentReports);
    if (dashboard.devices[0] && !dashboard.devices.some((device) => device.id === nextDeviceId)) {
      setSelectedDeviceId(dashboard.devices[0].id);
    }
    if (user?.role === "admin") {
      setAudits((await api.audits(nextToken)).logs);
    }
  }, [connectionMode, historyRange, rangeForCache, saveReadings, selectedDeviceId, token, user?.role]);

  useEffect(() => {
    void guarded(() => refresh());
  }, [guarded, refresh]);

  useEffect(() => {
    if (connectionMode === "cloud") return;
    let cancelled = false;
    let gatewayFailures = 0;
    async function pollLocal() {
      try {
        if (connectionMode === "gateway") {
          const sample = await gatewayApi.telemetry();
          if (cancelled) return;
          const reading = gatewayTelemetryToReading(sample);
          setGatewaySamples((current) => [...current.slice(-119), sample]);
          await saveReadings("gateway", [reading]);
          gatewayFailures = 0;
          setNotice("");
        } else {
          const sample = await localCarApi.telemetry();
          if (cancelled) return;
          const reading = localTelemetryToReading(sample);
          setLocalSamples((current) => [...current.slice(-119), sample]);
          await saveReadings("car-direct", [reading]);
          setNotice("");
        }
      } catch (error) {
        if (cancelled) return;
        if (connectionMode === "gateway") {
          gatewayFailures += 1;
          if (gatewayFailures >= 3) {
            changeConnectionMode("car-direct");
            setNotice("星闪基站 Wi-Fi 暂时不可达，已尝试切换到小车直连。");
            return;
          }
        }
        setNotice(error instanceof Error ? `${connectionMode} 连接失败：${error.message}` : `${connectionMode} 连接失败`);
      }
    }
    void pollLocal();
    const timer = window.setInterval(() => void pollLocal(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [changeConnectionMode, connectionMode, saveReadings]);

  useEffect(() => {
    if (!token || connectionMode !== "cloud") return;
    const events = new EventSource(`${apiBaseUrl()}/api/events?token=${encodeURIComponent(token)}`);
    events.addEventListener("telemetry", (event) => {
      const payload = JSON.parse((event as MessageEvent).data).data as { readings: Reading[]; report: AgentReport };
      setReadings((current) => [...current.slice(-150), ...payload.readings.filter((reading) => reading.deviceId === selectedDeviceId)]);
      setReports((current) => [payload.report, ...current].slice(0, 20));
      void saveReadings("cloud", payload.readings);
      void guarded(() => refresh());
    });
    events.addEventListener("command", () => void guarded(() => refresh()));
    events.addEventListener("patrol", () => void guarded(() => refresh()));
    events.addEventListener("device", () => void guarded(() => refresh()));
    events.onerror = () => setNotice("实时连接暂时中断，正在等待自动重连");
    return () => events.close();
  }, [connectionMode, guarded, refresh, saveReadings, selectedDeviceId, token]);

  const snapshot = useMemo(() => {
    if (!user) return null;
    return buildMobileOpenDesignSnapshot({
      user,
      connectionMode,
      historyRange,
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
  }, [activeReadings, audits, baseStations, commands, connectionMode, devices, historyRange, notice, reports, selectedDevice, tasks, user]);

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
    if (!token) return;
    if (message.type === "ready") {
      postSnapshot();
      return;
    }
    if (message.type === "logout") {
      logout();
      return;
    }
    if (message.type === "connection-mode") {
      changeConnectionMode(message.mode);
      return;
    }
    if (message.type === "history-range") {
      setHistoryRange(message.range);
      return;
    }
    await guarded(async () => {
      if (message.type === "drive") {
        const payload = buildCompatPayloadFromWheels({ left: message.left, right: message.right }, message.durationMs);
        if (connectionMode === "cloud") {
          await api.command(token, {
            deviceId: selectedDevice.id,
            baseStationId: selectedDevice.base_station_id,
            action: "drive",
            speed: message.speed,
            left: message.left,
            right: message.right,
            durationMs: message.durationMs
          });
        } else if (connectionMode === "gateway") {
          const sample = await gatewayApi.send(payload);
          const reading = gatewayTelemetryToReading(sample);
          setGatewaySamples((current) => [...current.slice(-119), sample]);
          await saveReadings("gateway", [reading]);
        } else {
          await localCarApi.send(payload);
        }
        return;
      }
      if (message.type === "stop") {
        if (connectionMode === "cloud") {
          await api.command(token, {
            deviceId: selectedDevice.id,
            baseStationId: selectedDevice.base_station_id,
            action: "stop",
            speed: 0
          });
        } else if (connectionMode === "gateway") {
          const sample = await gatewayApi.send({ cmd: "stop", speed: 0, duration_ms: 0 });
          const reading = gatewayTelemetryToReading(sample);
          setGatewaySamples((current) => [...current.slice(-119), sample]);
          await saveReadings("gateway", [reading]);
        } else {
          await localCarApi.send({ cmd: "stop", speed: 0, duration_ms: 0 });
        }
        return;
      }
      if (message.type === "create-patrol") {
        if (connectionMode === "gateway") {
          const sample = await gatewayApi.send({ cmd: "auto_start" });
          const reading = gatewayTelemetryToReading(sample);
          setGatewaySamples((current) => [...current.slice(-119), sample]);
          await saveReadings("gateway", [reading]);
          setNotice("已向星闪基站发送自动巡检启动指令");
          return;
        }
        if (connectionMode === "car-direct") {
          await localCarApi.send({ cmd: "auto_start" });
          setNotice("已向小车直连发送自动巡检启动指令");
          return;
        }
        await api.createPatrol(token, {
          deviceId: selectedDevice.id,
          baseStationId: selectedDevice.base_station_id,
          name: "APK 标准巡检",
          steps: [
            { action: "forward", speed: 50, durationMs: 1200 },
            { action: "left", speed: 40, durationMs: 500 },
            { action: "forward", speed: 45, durationMs: 1000 },
            { action: "stop", durationMs: 0 }
          ]
        });
        await refresh();
        return;
      }
      if (message.type === "refresh-agent") {
        const range = rangeForCache();
        const summary = summarizeReadingsForAgent(activeReadings, { ...range, maxPoints: 100 });
        if (token.startsWith("local-demo:")) {
          setReports((current) => [localAgentReport(activeReadings, connectionMode), ...current].slice(0, 20));
          return;
        }
        try {
          const result = await api.analyzeHistory(token, {
            deviceId: selectedDevice.id,
            range,
            source: connectionMode,
            readings: activeReadings,
            missingIntervals: summary.missingIntervals
          });
          setReports((current) => [result.report, ...current].slice(0, 20));
        } catch {
          setReports((current) => [localAgentReport(activeReadings, connectionMode), ...current].slice(0, 20));
        }
      }
    });
  }, [activeReadings, changeConnectionMode, connectionMode, guarded, logout, postSnapshot, rangeForCache, saveReadings, selectedDevice.base_station_id, selectedDevice.id, token]);

  useEffect(() => {
    function onMessage(event: MessageEvent<MobileOpenDesignToHostMessage>) {
      const message = event.data;
      if (!message || message.source !== "ws63-mobile-open-design") return;
      void handleBridgeMessage(message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleBridgeMessage]);

  if (!token || !user) {
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
