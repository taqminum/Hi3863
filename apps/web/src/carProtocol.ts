export type CarCommand = "forward" | "backward" | "left" | "right" | "stop" | "auto_start" | "auto_return" | "auto_stop";
export type MotionName = "stop" | "forward" | "backward" | "left" | "right" | "unknown";

export interface JoystickVector {
  x: number;
  y: number;
}

export interface WheelOutput {
  left: number;
  right: number;
}

export interface CompatControlPayload {
  cmd: CarCommand;
  speed?: number;
  duration_ms?: number;
}

export interface DrivePayload {
  cmd: "drive";
  left: number;
  right: number;
  duration_ms: number;
}

export interface CloudControlBody {
  deviceId: string;
  baseStationId: string;
  action: "drive" | "stop";
  speed: 0;
  left: number;
  right: number;
  durationMs: number;
}

export interface RawCarTelemetry {
  seq?: number;
  temp_x10?: number;
  humi_x10?: number;
  light_x10?: number;
  temp_alert?: number;
  humi_alert?: number;
  light_alert?: number;
  motion?: number;
  patrol?: number;
  err?: number;
}

export interface LocalTelemetrySample {
  seq: number;
  temperature: number;
  humidity: number;
  lightness: number;
  alerts: Array<"temperature" | "humidity" | "light">;
  motion: MotionName;
  patrol: boolean;
  err: number;
  recordedAt: string;
}

export const CAR_LOCAL_BASE_URL = "http://192.168.5.1:8080";
export const CAR_LOCAL_UDP_HOST = "255.255.255.255";
export const CAR_LOCAL_UDP_PORT = 8888;
export const CAR_LOCAL_UDP_CONTROL_SPEED = 35;
export const CAR_LOCAL_UDP_CONTROL_DURATION_MS = 500;
export const JOYSTICK_DEAD_ZONE = 0.18;
export const JOYSTICK_MAX_PERCENT = 100;
export const JOYSTICK_REPEAT_MS = 300;
export const JOYSTICK_COMMAND_DURATION_MS = 350;
export const MIN_EFFECTIVE_PERCENT = 35;

const motionNames: MotionName[] = ["stop", "forward", "backward", "left", "right"];

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number, maxPercent: number): number {
  const rounded = Math.round(clamp(value, -1, 1) * maxPercent);
  if (rounded !== 0 && Math.abs(rounded) < MIN_EFFECTIVE_PERCENT) {
    return rounded > 0 ? MIN_EFFECTIVE_PERCENT : -MIN_EFFECTIVE_PERCENT;
  }
  return rounded;
}

export function joystickToDifferential(
  vector: JoystickVector,
  options: { deadZone?: number; maxPercent?: number } = {}
): WheelOutput {
  const deadZone = options.deadZone ?? JOYSTICK_DEAD_ZONE;
  const maxPercent = options.maxPercent ?? JOYSTICK_MAX_PERCENT;
  const x = clamp(vector.x, -1, 1);
  const y = clamp(vector.y, -1, 1);
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadZone) return { left: 0, right: 0 };

  const turn = y > 0 ? -x : x;
  return {
    left: toPercent(clamp(y + turn, -1, 1), maxPercent),
    right: toPercent(clamp(y - turn, -1, 1), maxPercent)
  };
}

export function joystickToLegacyCommand(vector: JoystickVector, deadZone = JOYSTICK_DEAD_ZONE): CarCommand {
  const x = clamp(vector.x, -1, 1);
  const y = clamp(vector.y, -1, 1);
  if (Math.hypot(x, y) < deadZone) return "stop";
  if (Math.abs(y) >= Math.abs(x)) return y > 0 ? "forward" : "backward";
  return x > 0 ? "right" : "left";
}

export function commandSpeedFromJoystick(vector: JoystickVector, maxPercent = JOYSTICK_MAX_PERCENT): number {
  const magnitude = Math.min(1, Math.hypot(vector.x, vector.y));
  const speed = Math.round(magnitude * maxPercent);
  if (speed === 0) return 0;
  return clamp(speed, MIN_EFFECTIVE_PERCENT, 100);
}

export function buildCompatControlPayload(command: CarCommand, speed: number, durationMs: number): CompatControlPayload {
  if (command === "auto_start" || command === "auto_return" || command === "auto_stop") return { cmd: command };
  if (command === "stop") return { cmd: "stop", speed: 0, duration_ms: 0 };
  const normalizedSpeed = Math.round(clamp(speed, MIN_EFFECTIVE_PERCENT, 100));
  return {
    cmd: command,
    speed: normalizedSpeed,
    duration_ms: Math.round(clamp(durationMs, 0, 3000))
  };
}

export function buildDrivePayload(output: WheelOutput, durationMs: number): DrivePayload {
  return {
    cmd: "drive",
    left: Math.round(clamp(output.left, -100, 100)),
    right: Math.round(clamp(output.right, -100, 100)),
    duration_ms: Math.round(clamp(durationMs, 0, 3000))
  };
}

export function wheelOutputToLegacyCommand(output: WheelOutput): CarCommand {
  const left = Math.round(clamp(output.left, -100, 100));
  const right = Math.round(clamp(output.right, -100, 100));
  if (left === 0 && right === 0) return "stop";
  const average = (left + right) / 2;
  const difference = left - right;
  if (Math.abs(average) >= Math.abs(difference) * 0.75) {
    return average >= 0 ? "forward" : "backward";
  }
  return difference > 0 ? "right" : "left";
}

export function wheelOutputSpeed(output: WheelOutput): number {
  const speed = Math.max(Math.abs(output.left), Math.abs(output.right));
  return speed === 0 ? 0 : clamp(speed, MIN_EFFECTIVE_PERCENT, 100);
}

export function buildCompatPayloadFromWheels(output: WheelOutput, durationMs: number): CompatControlPayload {
  return buildCompatControlPayload(wheelOutputToLegacyCommand(output), wheelOutputSpeed(output), durationMs);
}

export function buildUdpGatewayCommand(payload: CompatControlPayload | DrivePayload): CarCommand {
  return payload.cmd === "drive" ? wheelOutputToLegacyCommand(payload) : payload.cmd;
}

export function buildUdpGatewayControlMessage(payload: CompatControlPayload | DrivePayload): string {
  if (payload.cmd === "drive") {
    return JSON.stringify({
      cmd: "drive",
      left: Math.round(clamp(payload.left, -100, 100)),
      right: Math.round(clamp(payload.right, -100, 100)),
      duration_ms: CAR_LOCAL_UDP_CONTROL_DURATION_MS
    });
  }

  const command = buildUdpGatewayCommand(payload);
  if (command === "auto_start" || command === "auto_return" || command === "auto_stop") {
    return JSON.stringify({ cmd: command });
  }
  if (command === "stop") {
    return JSON.stringify({ cmd: "stop", speed: 0, duration_ms: 0 });
  }
  const speed = Math.max(CAR_LOCAL_UDP_CONTROL_SPEED, payload.speed ?? CAR_LOCAL_UDP_CONTROL_SPEED);
  return JSON.stringify({
    cmd: command,
    speed,
    duration_ms: CAR_LOCAL_UDP_CONTROL_DURATION_MS
  });
}

export function buildCloudControlBody(deviceId: string, baseStationId: string, output: WheelOutput, durationMs: number): CloudControlBody {
  const left = Math.round(clamp(output.left, -100, 100));
  const right = Math.round(clamp(output.right, -100, 100));
  return {
    deviceId,
    baseStationId,
    action: left === 0 && right === 0 ? "stop" : "drive",
    speed: 0,
    left,
    right,
    durationMs: Math.round(clamp(durationMs, 0, 3000))
  };
}

export function motionName(value: unknown): MotionName {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < motionNames.length ? motionNames[index] : "unknown";
}

export function normalizeCarTelemetry(raw: RawCarTelemetry, recordedAt = new Date().toISOString()): LocalTelemetrySample {
  const alerts: LocalTelemetrySample["alerts"] = [];
  if (raw.temp_alert) alerts.push("temperature");
  if (raw.humi_alert) alerts.push("humidity");
  if (raw.light_alert) alerts.push("light");

  return {
    seq: Number(raw.seq ?? 0),
    temperature: Number(raw.temp_x10 ?? 0) / 10,
    humidity: Number(raw.humi_x10 ?? 0) / 10,
    lightness: Number(raw.light_x10 ?? 0) / 10,
    alerts,
    motion: motionName(raw.motion),
    patrol: Boolean(raw.patrol),
    err: Number(raw.err ?? 0),
    recordedAt
  };
}

export function localTelemetryToReading(sample: LocalTelemetrySample) {
  return {
    id: `local-ws63-car-001-${sample.seq}-${Date.parse(sample.recordedAt) || Date.now()}`,
    deviceId: "ws63-car-001",
    baseStationId: "local-car-softap",
    temperature: sample.temperature,
    humidity: sample.humidity,
    lightness: sample.lightness,
    gear: sample.patrol ? "AUTO" : "M",
    direction: sample.motion,
    status: sample.err === 0 ? (sample.motion === "stop" ? "idle" : "moving") : "fault",
    linkMode: "wifi-softap",
    cachedCount: 0,
    recordedAt: sample.recordedAt
  };
}
