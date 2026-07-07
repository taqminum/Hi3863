import { Activity, Bot, Car, ClipboardList, Database, Gauge, History, ShieldCheck, TowerControl, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { DeviceRecord, Role, User } from "../api";
import type { ConnectionMode } from "../App";
import { pageTitle, roleName } from "../utils";
import type { Tab } from "../views";

const tabs: Array<{ id: Tab; label: string; icon: typeof Activity; roles?: Role[] }> = [
  { id: "overview", label: "总览", icon: Gauge },
  { id: "control", label: "遥控", icon: Car },
  { id: "patrol", label: "巡检", icon: ClipboardList },
  { id: "history", label: "趋势", icon: History },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "devices", label: "设备", icon: TowerControl },
  { id: "audit", label: "审计", icon: ShieldCheck, roles: ["admin"] },
  { id: "debug", label: "验收", icon: Wrench, roles: ["admin"] }
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
  const visibleTabs = tabs.filter((item) => !item.roles || item.roles.includes(props.user.role));
  const nav = (
    <nav>
      {visibleTabs.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} className={props.tab === item.id ? "active" : ""} onClick={() => props.onTabChange(item.id)} title={item.label}>
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={24} />
          <div>
            <strong>WS63 环境巡检平台</strong>
            <span>SLE 基站云端控制台</span>
          </div>
        </div>
        {nav}
        <div className="account">
          <span>{props.user.displayName}</span>
          <b>{roleName(props.user.role)}</b>
          <button onClick={props.onLogout}>退出</button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{pageTitle(props.tab)}</h1>
            <p>云端 API：rxcccccc.icu/ws63-api · 当前访问：{location.host || "localhost"}</p>
          </div>
          <div className="topbar-controls">
            <select value={props.connectionMode} onChange={(event) => props.onConnectionModeChange(event.target.value as ConnectionMode)}>
              <option value="cloud">云端基站</option>
              <option value="local">本地小车</option>
            </select>
            {props.connectionMode === "local" ? (
              <input value={props.localCarUrl} onChange={(event) => props.onLocalCarUrlChange(event.target.value)} aria-label="本地小车地址" />
            ) : (
              <select value={props.selectedDeviceId} onChange={(event) => props.onDeviceChange(event.target.value)}>
                {props.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
              </select>
            )}
          </div>
        </header>
        {props.notice && <button className="notice" onClick={props.onClearNotice}>{props.notice}</button>}
        {props.children}
      </main>

      <div className="bottom-tabs">{nav}</div>
    </div>
  );
}
