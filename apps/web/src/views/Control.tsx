import { ArrowDown, ArrowUp, Square } from "lucide-react";
import { useState } from "react";
import { api, type Action, type ControlCommand, type DeviceRecord } from "../api";
import { formatTime } from "../utils";

export function Control({
  token,
  device,
  commands,
  onNotice,
  onRefresh
}: {
  token: string;
  device?: DeviceRecord;
  commands: ControlCommand[];
  onNotice: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [speed, setSpeed] = useState(55);

  async function send(action: Action) {
    if (!device) return;
    const result = await api.command(token, { deviceId: device.id, baseStationId: device.base_station_id, action, speed });
    onNotice(`命令已进入基站队列：${result.command.payload}`);
    await onRefresh();
  }

  return (
    <section className="split control-layout">
      <div className="panel control-panel">
        <h2>手动遥控</h2>
        <div className="speed-row">
          <span>速度 {speed}%</span>
          <input type="range" min="0" max="100" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
        </div>
        <div className="control-grid">
          <button onClick={() => send("forward")} title="前进"><ArrowUp />前进</button>
          <button className="stop" onClick={() => send("stop")} title="停止"><Square />停止</button>
          <button onClick={() => send("backward")} title="后退"><ArrowDown />后退</button>
        </div>
        <p className="muted">小车通过 SLE 接收基站下发的队列命令，Web 和 APK 只连接云端。</p>
      </div>
      <div className="panel">
        <h2>命令历史</h2>
        <div className="table">
          {commands.map((command) => (
            <div className="tr" key={command.id}>
              <span>{command.payload}</span>
              <b>{command.status}</b>
              <time>{formatTime(command.acknowledged_at ?? command.created_at)}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
