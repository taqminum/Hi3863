import { useEffect, useState } from "react";
import { api, type BaseStationRecord, type DeviceRecord, type Role } from "../api";
import { StatusRow } from "../components/Primitives";

export function DeviceView({
  token,
  role,
  devices,
  baseStations,
  onNotice,
  onRefresh
}: {
  token: string;
  role: Role;
  devices: DeviceRecord[];
  baseStations: BaseStationRecord[];
  onNotice: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState(devices[0]?.id ?? "");
  const editing = devices.find((device) => device.id === editingId) ?? devices[0];
  const [name, setName] = useState("");
  const [baseStationId, setBaseStationId] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setBaseStationId(editing.base_station_id);
    setRemark(editing.remark ?? "");
  }, [editing?.id]);

  async function save() {
    if (!editing) return;
    await api.updateDevice(token, editing.id, { name, baseStationId, remark });
    onNotice("设备信息已更新");
    await onRefresh();
  }

  return (
    <section className="split">
      <div className="panel">
        <h2>车辆</h2>
        {devices.length === 0 && <p className="muted">暂无车辆数据。</p>}
        {devices.map((device) => (
          <StatusRow key={device.id} name={device.name} status={`${device.status} / ${device.connection_mode}`} time={device.last_seen} />
        ))}
      </div>
      <div className="panel">
        <h2>星闪基站</h2>
        {baseStations.length === 0 && <p className="muted">暂无基站数据。</p>}
        {baseStations.map((base) => (
          <StatusRow key={base.id} name={base.name} status={`${base.status} / RSSI ${base.last_rssi ?? "--"} dBm / 缓存 ${base.cached_count ?? 0}`} time={base.last_heartbeat} />
        ))}
      </div>
      {role === "admin" && editing && (
        <div className="panel full-span">
          <h2>设备管理</h2>
          <div className="form-grid">
            <label className="field">设备<select value={editingId} onChange={(event) => setEditingId(event.target.value)}>
              {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </select></label>
            <label className="field">名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field">绑定基站<select value={baseStationId} onChange={(event) => setBaseStationId(event.target.value)}>
              {baseStations.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
            </select></label>
            <label className="field">备注<input value={remark} onChange={(event) => setRemark(event.target.value)} /></label>
          </div>
          <button onClick={save}>保存设备信息</button>
        </div>
      )}
    </section>
  );
}
