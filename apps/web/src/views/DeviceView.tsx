import { Check, Cpu, Database, ExternalLink, Eye, History, Key, RadioTower, RefreshCw, Send, Server, Settings2, Shield, Smartphone, UserCog, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type DeviceRecord } from "../api";
import { formatTime, roleName } from "../utils";
import { statusLabel, type DashboardViewModel } from "../viewModels";

interface ExportPreview {
  name: string;
  mimeType: string;
  content: string;
}

export function DeviceView({
  token,
  model,
  onNotice,
  onRefresh
}: {
  token: string;
  model: DashboardViewModel;
  onNotice: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const role = model.user.role;
  const devices = model.devices;
  const baseStations = model.baseStations;
  const [editingId, setEditingId] = useState(devices[0]?.id ?? "");
  const editing = devices.find((device) => device.id === editingId) ?? devices[0];
  const [name, setName] = useState("");
  const [baseStationId, setBaseStationId] = useState("");
  const [remark, setRemark] = useState("");
  const [preview, setPreview] = useState<ExportPreview | null>(null);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setBaseStationId(editing.base_station_id);
    setRemark(editing.remark ?? "");
  }, [editing?.id]);

  async function save() {
    if (!editing || role !== "admin") return;
    await api.updateDevice(token, editing.id, { name, baseStationId, remark });
    onNotice("设备信息已更新");
    await onRefresh();
  }

  async function createCommand() {
    if (!model.selectedDevice || role !== "admin") return;
    const result = await api.command(token, {
      deviceId: model.selectedDevice.id,
      baseStationId: model.selectedDevice.base_station_id,
      action: "forward",
      speed: 30
    });
    onNotice(`验收命令已创建：${result.command.payload}`);
    await onRefresh();
  }

  async function createPatrol() {
    if (!model.selectedDevice || role !== "admin") return;
    await api.createPatrol(token, {
      deviceId: model.selectedDevice.id,
      baseStationId: model.selectedDevice.base_station_id,
      name: "验收巡检",
      steps: [
        { action: "forward", speed: 30, durationMs: 1200 },
        { action: "stop", speed: 0, durationMs: 500 }
      ]
    });
    onNotice("验收巡检已创建");
    await onRefresh();
  }

  async function createAgentReport() {
    if (!model.selectedDevice || role !== "admin") return;
    await api.createReport(token, model.selectedDevice.id);
    onNotice("Agent 验收报告已生成");
    await onRefresh();
  }

  async function previewReadingsCsv() {
    if (!model.selectedDevice) return;
    setPreview({
      name: "readings.csv",
      mimeType: "text/csv",
      content: await api.exportReadingsCsv(token, model.selectedDevice.id)
    });
    onNotice("readings.csv 已加载到应用内预览");
  }

  async function previewSummaryJson() {
    setPreview({
      name: "summary.json",
      mimeType: "application/json",
      content: await api.exportSummaryJson(token, model.selectedDevice?.id ?? "ws63-car-001")
    });
    onNotice("summary.json 已加载到应用内预览");
  }

  function downloadPreview() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview.content], { type: preview.mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = preview.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const base = model.base;
  const device = model.selectedDevice;

  return (
    <section id="view-manage" className="view-section active">
      <div className="admin-dashboard">
        <div className="admin-panel">
          <div className="panel-header"><div className="panel-title"><Cpu width={14} height={14} />车辆设备</div><button className="panel-action" disabled={role !== "admin"}><Settings2 width={12} height={12} />编排</button></div>
          <div className="panel-body">
            <div className="hw-head"><div className="hw-identity"><div className="hw-icon"><Smartphone width={16} height={16} /></div><div className="hw-name">{device?.name ?? "ROVER-01"}</div></div><div className={device?.status === "online" ? "badge online" : "badge offline"}>{statusLabel(device?.status)}</div></div>
            <div className="hw-grid">
              <div className="hw-item"><span className="hw-item-label">链路模式</span><span className="hw-item-val highlight">{device?.connection_mode ?? "SLE"}</span></div>
              <div className="hw-item"><span className="hw-item-label">绑定网关</span><span className="hw-item-val">{device?.base_station_id ?? "--"}</span></div>
              <div className="hw-item"><span className="hw-item-label">最后活跃</span><span className="hw-item-val">{formatTime(device?.last_seen)}</span></div>
              <div className="hw-item"><span className="hw-item-label">设备备注</span><span className="hw-item-val muted-val">{device?.remark ?? "巡检主车 A 号"}</span></div>
            </div>
            {role === "admin" && editing && (
              <div className="edit-form">
                <select value={editingId} onChange={(event) => setEditingId(event.target.value)}>{devices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <input value={name} onChange={(event) => setName(event.target.value)} aria-label="设备名称" />
                <select value={baseStationId} onChange={(event) => setBaseStationId(event.target.value)}>{baseStations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <input value={remark} onChange={(event) => setRemark(event.target.value)} aria-label="备注" />
                <button className="btn-primary" onClick={save}>保存设备信息</button>
              </div>
            )}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-header"><div className="panel-title"><Shield width={14} height={14} />权限角色</div><button className="panel-action"><Users width={12} height={12} />{roleName(role)}</button></div>
          <div className="panel-body">
            <div className="roles-container">
              <RoleCard active={role === "admin"} icon={Key} name="admin" items={["设备管理", "审计追踪", "遥控及巡检"]} />
              <RoleCard active={role === "operator"} icon={UserCog} name="operator" items={["车辆遥控", "创建巡检", "只读管理"]} denied="系统设置" />
              <RoleCard active={role === "viewer"} icon={Eye} name="viewer" items={["数据总览", "Agent 分析"]} denied="车辆操控" />
            </div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-header"><div className="panel-title"><RadioTower width={14} height={14} />边缘基站</div><button className="panel-action" onClick={onRefresh}><RefreshCw width={12} height={12} />刷新</button></div>
          <div className="panel-body">
            <div className="hw-head"><div className="hw-identity"><div className="hw-icon"><Server width={16} height={16} /></div><div className="hw-name">{base?.name ?? "H3863"}</div></div><div className={base?.status === "online" ? "badge online" : "badge offline"}>{statusLabel(base?.status)}</div></div>
            <div className="hw-grid">
              <div className="hw-item"><span className="hw-item-label">上云状态</span><span className="hw-item-val highlight">{base?.network_status ?? "--"}</span></div>
              <div className="hw-item"><span className="hw-item-label">离线缓存</span><span className={model.cachedCount > 0 ? "hw-item-val warning" : "hw-item-val"}>{model.cachedCount}</span></div>
              <div className="hw-item"><span className="hw-item-label">SLE RSSI</span><span className="hw-item-val">{model.rssi ?? "--"} dBm</span></div>
              <div className="hw-item"><span className="hw-item-label">心跳时间</span><span className="hw-item-val">{formatTime(base?.last_heartbeat)}</span></div>
            </div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-header"><div className="panel-title"><History width={14} height={14} />审计追踪</div><button className="panel-action"><ExternalLink width={12} height={12} />完整记录</button></div>
          <div className="panel-body">
            <div className="audit-list">
              {model.audits.length === 0 && <div className="empty-state">暂无审计日志</div>}
              {model.audits.slice(0, 6).map((log) => (
                <div className="audit-item success" key={log.id}>
                  <div className="au-time">{formatTime(log.created_at)}</div>
                  <div className="au-user">{log.user_id ?? "system"}</div>
                  <div className="au-action">{log.action} {log.target_id ? `[${log.target_id}]` : ""}</div>
                  <div className="au-result success">OK</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-panel full-admin-panel">
          <div className="panel-header"><div className="panel-title"><Database width={14} height={14} />后端验收工具</div><span className="panel-meta">admin only</span></div>
          <div className="panel-body">
            <div className="acceptance-actions">
              <button onClick={onRefresh}>刷新总览</button>
              <button onClick={createCommand} disabled={role !== "admin" || !device}><Send width={14} height={14} />创建命令</button>
              <button onClick={createPatrol} disabled={role !== "admin" || !device}>创建巡检</button>
              <button onClick={createAgentReport} disabled={role !== "admin" || !device}>生成 Agent</button>
              <button onClick={previewReadingsCsv} disabled={!device}>预览 readings.csv</button>
              <button onClick={previewSummaryJson}>预览 summary.json</button>
            </div>
            {preview && (
              <div className="export-preview">
                <div className="panel-header"><div className="panel-title">{preview.name}</div><button className="panel-action" onClick={downloadPreview}>下载</button></div>
                <textarea readOnly value={preview.content} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RoleCard({ active, icon: Icon, name, items, denied }: { active: boolean; icon: typeof Key; name: string; items: string[]; denied?: string }) {
  return (
    <div className={active ? "role-card active" : "role-card"}>
      <div className="role-name"><Icon width={12} height={12} />{name}</div>
      <div className="perm-list">
        {items.map((item) => <div className="perm-item" key={item}><Check width={10} height={10} />{item}</div>)}
        {denied && <div className="perm-item denied"><X width={10} height={10} />{denied}</div>}
      </div>
    </div>
  );
}
