import { useState } from "react";
import { api, type DeviceRecord, type PatrolTask } from "../api";
import { formatTime } from "../utils";

export function Patrol({
  token,
  device,
  tasks,
  onRefresh,
  onNotice
}: {
  token: string;
  device?: DeviceRecord;
  tasks: PatrolTask[];
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [name, setName] = useState("温室 A 区巡检");

  async function create() {
    if (!device) return;
    await api.createPatrol(token, {
      deviceId: device.id,
      baseStationId: device.base_station_id,
      name,
      steps: [
        { action: "forward", speed: 50, durationMs: 3000 },
        { action: "stop", speed: 0, durationMs: 1000 },
        { action: "backward", speed: 35, durationMs: 2000 }
      ]
    });
    onNotice("巡检任务已创建，等待基站拉取");
    await onRefresh();
  }

  return (
    <section className="split">
      <div className="panel">
        <h2>新建任务</h2>
        <label className="field">任务名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <button onClick={create} disabled={!device}>创建预设巡检</button>
      </div>
      <div className="panel">
        <h2>任务队列</h2>
        <div className="table">
          {tasks.length === 0 && <p className="muted">暂无巡检任务。</p>}
          {tasks.map((task) => (
            <div className="tr task-row" key={task.id}>
              <span>{task.name}</span>
              <b>{task.status}</b>
              <time>{formatTime(task.finished_at ?? task.started_at ?? task.created_at)}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
