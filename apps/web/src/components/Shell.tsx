import { BatteryMedium, Cpu, Database, Gamepad2, LayoutDashboard, ListChecks, LogOut, Moon, Sun, Wifi } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { DeviceRecord, User } from "../api";
import type { ConnectionMode } from "../App";
import { roleName } from "../utils";
import type { Tab } from "../views";

const tabs: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "control", label: "遥控", icon: Gamepad2 },
  { id: "tasks", label: "巡检", icon: ListChecks },
  { id: "data", label: "数据", icon: Database },
  { id: "manage", label: "管理", icon: Cpu }
];

interface ShellProps {
  user: User;
  tab: Tab;
  devices: DeviceRecord[];
  selectedDeviceId: string;
  notice: string;
  connectionMode: ConnectionMode;
  localCarUrl: string;
  children: ReactNode;
  onTabChange: (tab: Tab) => void;
  onDeviceChange: (deviceId: string) => void;
  onConnectionModeChange: (mode: ConnectionMode) => void;
  onLocalCarUrlChange: (value: string) => void;
  onClearNotice: () => void;
  onLogout: () => void;
}

export function Shell(props: ShellProps) {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
  const [light, setLight] = useState(() => localStorage.getItem("ws63-theme") === "light");

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    localStorage.setItem("ws63-theme", next ? "light" : "dark");
  }

  const nav = (
    <nav className="side-nav" data-od-id="side-nav">
      {tabs.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} className={props.tab === item.id ? "nav-item active" : "nav-item"} onClick={() => props.onTabChange(item.id)}>
            <Icon />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={light ? "app-stage light-theme" : "app-stage"}>
      <div className="device-container">
        <div className="main-wrapper">
          <div className="top-bar">
            <div className="top-bar-left">
              <h1 data-od-id="app-title">WS63E 控制台</h1>
              <div className="cloud-status"><div className="status-dot" />{props.connectionMode === "cloud" ? "云端基站" : "本地直连"}</div>
            </div>
            <div className="sys-status">
              <button className="theme-btn" onClick={toggleTheme} aria-label="切换深浅色主题">{light ? <Moon width={16} height={16} /> : <Sun width={16} height={16} />}</button>
              <div className="sys-pill"><Wifi width={14} height={14} />{props.connectionMode === "cloud" ? "TCP" : "SoftAP"}</div>
              <div className="sys-pill"><BatteryMedium width={14} height={14} />{clock}</div>
              <div className="sys-pill user-pill">{props.user.displayName} / {roleName(props.user.role)}</div>
              <button className="theme-btn" onClick={props.onLogout} aria-label="退出登录"><LogOut width={16} height={16} /></button>
            </div>
          </div>

          <div className="control-strip">
            <select value={props.connectionMode} onChange={(event) => props.onConnectionModeChange(event.target.value as ConnectionMode)} aria-label="连接模式">
              <option value="cloud">云端基站</option>
              <option value="local">本地小车</option>
            </select>
            {props.connectionMode === "local" ? (
              <input value={props.localCarUrl} onChange={(event) => props.onLocalCarUrlChange(event.target.value)} aria-label="本地小车地址" />
            ) : (
              <select value={props.selectedDeviceId} onChange={(event) => props.onDeviceChange(event.target.value)} aria-label="选择设备">
                {props.devices.length === 0 && <option value={props.selectedDeviceId}>等待设备数据</option>}
                {props.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
              </select>
            )}
          </div>

          {props.notice && <button className="notice" onClick={props.onClearNotice}>{props.notice}</button>}
          <main className="content-area">{props.children}</main>
        </div>
        {nav}
      </div>
    </div>
  );
}
