import { Crosshair, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ControlCommand, type DeviceRecord } from "../api";
import {
  buildCloudControlBody,
  buildCompatPayloadFromWheels,
  commandSpeedFromJoystick,
  JOYSTICK_COMMAND_DURATION_MS,
  JOYSTICK_MAX_PERCENT,
  JOYSTICK_REPEAT_MS,
  joystickToDifferential,
  joystickToLegacyCommand,
  type JoystickVector,
  type WheelOutput
} from "../carProtocol";
import { localCarApi } from "../localCarApi";
import type { ConnectionMode } from "../types";
import { compactTime } from "../viewModels";

function vectorFromPointer(element: HTMLDivElement, clientX: number, clientY: number): JoystickVector {
  const rect = element.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  const x = (clientX - rect.left - rect.width / 2) / radius;
  const y = (rect.top + rect.height / 2 - clientY) / radius;
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

function wheelSummary(wheels: WheelOutput): string {
  return `左轮 ${wheels.left}% / 右轮 ${wheels.right}%`;
}

export function Control({
  token,
  connectionMode,
  device,
  commands,
  onNotice,
  onRefresh
}: {
  token: string;
  connectionMode: ConnectionMode;
  device?: DeviceRecord;
  commands: ControlCommand[];
  onNotice: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [vector, setVector] = useState<JoystickVector>({ x: 0, y: 0 });
  const [maxPercent, setMaxPercent] = useState(JOYSTICK_MAX_PERCENT);
  const [sending, setSending] = useState(false);
  const activePointer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const lastSendAt = useRef(0);
  const padRef = useRef<HTMLDivElement | null>(null);

  const wheels = useMemo(() => joystickToDifferential(vector, { maxPercent }), [vector, maxPercent]);
  const speed = commandSpeedFromJoystick(vector, maxPercent);
  const legacyAction = joystickToLegacyCommand(vector);
  const knobStyle = { transform: `translate(${vector.x * 40}px, ${-vector.y * 40}px)` };

  async function sendDrive(nextVector: JoystickVector, force = false) {
    if (!device) return;
    const now = Date.now();
    if (!force && now - lastSendAt.current < JOYSTICK_REPEAT_MS) return;
    const nextWheels = joystickToDifferential(nextVector, { maxPercent });
    const isStop = nextWheels.left === 0 && nextWheels.right === 0;
    if (inFlight.current && !isStop) return;
    lastSendAt.current = now;
    inFlight.current = true;
    setSending(true);
    try {
      if (connectionMode === "car-direct") {
        await localCarApi.send(buildCompatPayloadFromWheels(nextWheels, JOYSTICK_COMMAND_DURATION_MS));
        onNotice(`已发送本地小车控制：${wheelSummary(nextWheels)}`);
      } else if (connectionMode === "gateway") {
        onNotice("星闪基站 UDP 遥控请在 Android APK 中使用。");
      } else {
        const result = await api.command(token, buildCloudControlBody(device.id, device.base_station_id, nextWheels, JOYSTICK_COMMAND_DURATION_MS));
        onNotice(`命令已进入基站队列：${result.command.payload}`);
        await onRefresh();
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "控制命令发送失败");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function updateFromPointer(clientX: number, clientY: number, force = false) {
    if (!padRef.current) return;
    const next = vectorFromPointer(padRef.current, clientX, clientY);
    setVector(next);
    void sendDrive(next, force);
  }

  function stop(force = true) {
    activePointer.current = null;
    setVector({ x: 0, y: 0 });
    void sendDrive({ x: 0, y: 0 }, force);
  }

  useEffect(() => {
    const stopOnHidden = () => {
      if (document.visibilityState === "hidden") stop(true);
    };
    document.addEventListener("visibilitychange", stopOnHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopOnHidden);
      stop(true);
    };
  }, [device?.id, device?.base_station_id, connectionMode, maxPercent]);

  return (
    <section id="view-control" className="view-section active">
      <div className="control-layout">
        <div className="joystick-panel">
          <div
            ref={padRef}
            className="joystick-base"
            onPointerDown={(event) => {
              activePointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event.clientX, event.clientY, true);
            }}
            onPointerMove={(event) => {
              if (activePointer.current !== event.pointerId) return;
              updateFromPointer(event.clientX, event.clientY);
            }}
            onPointerUp={() => stop()}
            onPointerCancel={() => stop()}
            role="application"
            aria-label="小车连续摇杆"
          >
            <div className={sending ? "joystick-knob active" : "joystick-knob"} style={knobStyle} />
          </div>
          <button className="btn-stop" onClick={() => stop()}><Square width={16} height={16} />立即停车</button>
          <div className="drive-readout">
            <span>摇杆 X {vector.x.toFixed(2)}</span>
            <span>摇杆 Y {vector.y.toFixed(2)}</span>
            <span>{wheelSummary(wheels)}</span>
          </div>
        </div>

        <div className="center-console">
          <div className="camera-feed">
            <div className="camera-badge"><div className="status-dot" />CAM-WS-01 直播流</div>
            <div className="camera-hud"><Crosshair width={36} height={36} /></div>
            <div className="camera-overlay"><span>LAT: {connectionMode === "cloud" ? "云端队列" : connectionMode === "gateway" ? "基站 UDP" : "本地直连"}</span><span>{device?.name ?? "未选择设备"}</span></div>
          </div>
          <div className="command-log">
            <div className="cmd-line"><span className="cmd-time">[{new Date().toLocaleTimeString("zh-CN", { hour12: false })}]</span><span className="cmd-info">系统: 横屏遥控控制舱已就绪</span></div>
            <div className="cmd-line"><span className="cmd-time">LIVE</span><span className="cmd-info">方向: {legacyAction} / 速度 {speed}% / 上限 {maxPercent}%</span></div>
            {commands.slice(0, 6).map((command) => (
              <div className="cmd-line" key={command.id}>
                <span className="cmd-time">[{compactTime(command.created_at)}]</span>
                <span className={command.status === "failed" ? "cmd-info danger" : "cmd-info"}>{command.payload} · {command.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="speed-panel">
          <div className="speed-value-display">{(maxPercent / 100).toFixed(1)} <span>m/s</span></div>
          <div className="v-slider-wrapper">
            <div className="v-slider-track"><div className="v-slider-fill" style={{ height: `${maxPercent}%` }} /></div>
            <input className="v-slider-input" type="range" min="20" max="100" value={maxPercent} onChange={(event) => setMaxPercent(Number(event.target.value))} aria-label="速度限制" />
          </div>
          <div className="speed-label">速度限制</div>
        </div>
      </div>
    </section>
  );
}
