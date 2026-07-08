import { Activity, AlertCircle, Camera, CornerDownLeft, List, MapPin, Navigation, PlusCircle, Power, RadioTower, Send } from "lucide-react";
import { useState } from "react";
import { api, type DeviceRecord, type PatrolTask, type Role } from "../api";
import { formatTime } from "../utils";
import { taskStatusLabel, type DashboardViewModel } from "../viewModels";

const routeTemplates = {
  greenhouse: {
    label: "温室湿度复核",
    steps: [
      { action: "forward", speed: 50, durationMs: 3000 },
      { action: "stop", speed: 0, durationMs: 1000 },
      { action: "backward", speed: 35, durationMs: 2000 }
    ]
  },
  device: {
    label: "常规设备巡检",
    steps: [
      { action: "forward", speed: 45, durationMs: 2500 },
      { action: "stop", speed: 0, durationMs: 800 },
      { action: "forward", speed: 35, durationMs: 1800 }
    ]
  }
} as const;

export function Patrol({
  token,
  role,
  device,
  tasks,
  model,
  onRefresh,
  onNotice
}: {
  token: string;
  role: Role;
  device?: DeviceRecord;
  tasks: PatrolTask[];
  model: DashboardViewModel;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [name, setName] = useState("Auto-Inspect-094");
  const [template, setTemplate] = useState<keyof typeof routeTemplates>("greenhouse");
  const canCreate = role === "admin" || role === "operator";
  const latestTask = tasks[0];

  async function create() {
    if (!device || !canCreate) return;
    await api.createPatrol(token, {
      deviceId: device.id,
      baseStationId: device.base_station_id,
      name,
      steps: [...routeTemplates[template].steps]
    });
    onNotice("巡检任务已推送到云端任务队列，等待基站拉取");
    await onRefresh();
  }

  return (
    <section id="view-tasks" className="view-section active">
      <div className="tasks-layout">
        <div className="task-panel">
          <div className="panel-header"><span>新建任务</span><PlusCircle width={16} height={16} className="header-icon-btn" /></div>
          <div className="panel-body">
            <div className="status-summary">
              <div className="status-row"><span className="status-label"><Activity width={12} height={12} />目标小车</span><span className="status-val">{device?.name ?? "未选择"}</span></div>
              <div className="status-row"><span className="status-label"><RadioTower width={12} height={12} />边缘基站</span><span className={model.base?.status === "online" ? "status-val online" : "status-val"}>{model.base?.name ?? "H3863"} {model.base?.status === "online" ? "在线" : "未知"}</span></div>
              <div className="status-row"><span className="status-label"><Activity width={12} height={12} />链路信号</span><span className="status-val">{model.rssi ?? "--"} dBm</span></div>
            </div>
            <div className="form-group">
              <label className="form-label">任务名称</label>
              <input type="text" className="form-control" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">预设路线模板</label>
              <select className="form-control" value={template} onChange={(event) => setTemplate(event.target.value as keyof typeof routeTemplates)}>
                {Object.entries(routeTemplates).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </div>
            <button className="btn-primary" onClick={create} disabled={!device || !canCreate}>
              <Send width={16} height={16} />{canCreate ? "一键下发任务" : "观察员无下发权限"}
            </button>
          </div>
        </div>

        <div className="task-panel">
          <div className="panel-header"><span>任务队列 ({tasks.length})</span><List width={16} height={16} className="header-icon-btn" /></div>
          <div className="task-cards">
            {tasks.length === 0 && <div className="empty-state">暂无巡检任务</div>}
            {tasks.slice(0, 5).map((task) => (
              <div className={`task-card ${task.status}`} key={task.id}>
                <div className="tc-title">{task.name}</div>
                <div className="tc-meta"><MapPin />{taskStatusLabel(task.status)}</div>
                <div className="tc-foot"><span>{formatTime(task.finished_at ?? task.started_at ?? task.created_at)}</span><span>{task.base_station_id}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="task-panel timeline-panel">
          <div className="panel-header"><span>执行时间线</span><span className="panel-meta">{latestTask ? taskStatusLabel(latestTask.status) : "等待任务"}</span></div>
          <div className="timeline">
            <div className="tl-item done"><div className="tl-dot" /><div><div className="tl-title"><Power width={14} height={14} />启动系统与自检</div><p>检查云端会话、基站在线状态和小车节点。</p></div></div>
            <div className={latestTask ? "tl-item done" : "tl-item"}><div className="tl-dot" /><div><div className="tl-title"><Navigation width={14} height={14} />导航至目标区域</div><p>{latestTask?.name ?? "等待巡检任务下发"}</p></div></div>
            <div className={latestTask?.status === "running" || latestTask?.status === "completed" ? "tl-item active" : "tl-item"}><div className="tl-dot" /><div><div className="tl-title"><Camera width={14} height={14} />环视采图与环境取样</div><p>采集温湿度、光照和链路质量。</p></div></div>
            <div className={latestTask?.status === "failed" ? "tl-item error" : "tl-item"}><div className="tl-dot" /><div><div className="tl-title"><AlertCircle width={14} height={14} />异常检测</div><p>{latestTask?.status === "failed" ? "任务执行失败，请检查基站回执。" : "暂无异常。"}</p></div></div>
            <div className={latestTask?.status === "completed" ? "tl-item done" : "tl-item"}><div className="tl-dot" /><div><div className="tl-title"><CornerDownLeft width={14} height={14} />返航至充电基站</div><p>{latestTask?.finished_at ? formatTime(latestTask.finished_at) : "等待完成回执"}</p></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
