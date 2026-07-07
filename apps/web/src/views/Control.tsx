import { RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ControlCommand, type DeviceRecord } from "../api";
import {
  buildCloudControlBody,
  buildCompatControlPayload,
  buildDrivePayload,
  commandSpeedFromJoystick,
  JOYSTICK_COMMAND_DURATION_MS,
  JOYSTICK_MAX_PERCENT,
  JOYSTICK_REPEAT_MS,
  joystickToDifferential,
  joystickToLegacyCommand,
  type JoystickVector,
  type WheelOutput
} from "../carProtocol";
import type { ConnectionMode } from "../App";
import { localCarApi } from "../localCarApi";
import { formatTime } from "../utils";

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
  const knobStyle = { transform: `translate(${vector.x * 72}px, ${-vector.y * 72}px)` };

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
      if (connectionMode === "local") {
        try {
          await localCarApi.send(buildDrivePayload(nextWheels, JOYSTICK_COMMAND_DURATION_MS));
        } catch {
          await localCarApi.send(buildCompatControlPayload(joystickToLegacyCommand(nextVector), commandSpeedFromJoystick(nextVector, maxPercent), JOYSTICK_COMMAND_DURATION_MS));
        }
        onNotice(`已发送本地小车控制：${wheelSummary(nextWheels)}`);
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
    <section className="split control-layout">
      <div className="panel control-panel">
        <div className="panel-head">
          <div>
            <h2>连续摇杆遥控</h2>
            <p className="muted">Web 与 APK 使用同一套控制协议，云端模式通过基站转发到小车。</p>
          </div>
          <button className="icon-command" onClick={() => stop()} title="立即停车"><Square />停车</button>
        </div>

        <div className="speed-row">
          <span>电机上限 {maxPercent}%</span>
          <input type="range" min="20" max="100" value={maxPercent} onChange={(event) => setMaxPercent(Number(event.target.value))} />
        </div>

        <div
          ref={padRef}
          className={sending ? "joystick-pad sending" : "joystick-pad"}
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
          <div className="joystick-axis horizontal" />
          <div className="joystick-axis vertical" />
          <div className="joystick-knob" style={knobStyle}><RotateCcw /></div>
        </div>

        <div className="drive-readout">
          <span>摇杆 x {vector.x.toFixed(2)} / y {vector.y.toFixed(2)}</span>
          <span>{wheelSummary(wheels)}</span>
          <span>兼容方向 {legacyAction} / 速度 {speed}%</span>
        </div>
      </div>

      <div className="panel">
        <h2>命令历史</h2>
        <div className="table">
          {commands.length === 0 && <p className="muted">暂无命令。</p>}
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
