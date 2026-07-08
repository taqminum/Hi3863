import dgram from "node:dgram";

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizePatrolSteps(task) {
  if (Array.isArray(task.steps)) return task.steps;
  if (typeof task.steps_json !== "string") return [];
  const parsed = JSON.parse(task.steps_json);
  return Array.isArray(parsed) ? parsed : [];
}

export function patrolStepToPayload(step) {
  const action = ["forward", "backward", "left", "right", "stop"].includes(String(step?.action))
    ? String(step.action)
    : "forward";
  if (action === "stop") {
    return JSON.stringify({ cmd: "stop", speed: 0, duration_ms: 0 });
  }
  return JSON.stringify({
    cmd: action,
    speed: action === "left" || action === "right"
      ? clamp(step?.speed ?? 50, 20, 100)
      : clamp(step?.speed ?? 40, 0, 100),
    duration_ms: clamp(step?.durationMs ?? step?.duration_ms ?? 2000, 0, 60000)
  });
}

export async function pollPendingPatrolTasks(options) {
  const {
    cloudBaseUrl,
    baseStationId,
    deviceKey,
    fetchImpl = fetch
  } = options;

  if (!cloudBaseUrl) throw new Error("cloudBaseUrl is required");
  if (!baseStationId) throw new Error("baseStationId is required");
  if (!deviceKey) throw new Error("deviceKey is required");

  const response = await fetchImpl(
    `${cloudBaseUrl.replace(/\/$/, "")}/api/base-stations/${encodeURIComponent(baseStationId)}/patrol-tasks/pending`,
    {
      headers: {
        "X-Device-Key": deviceKey
      }
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Pending patrol task pull failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function sendPatrolStep(options) {
  const {
    gatewayHost,
    gatewayPort,
    payload,
    timeoutMs = 1000
  } = options;

  if (!gatewayHost) throw new Error("gatewayHost is required");
  if (!gatewayPort) throw new Error("gatewayPort is required");
  if (!payload) throw new Error("payload is required");

  const socket = dgram.createSocket("udp4");
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`UDP send timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("error", (error) => {
        clearTimeout(timer);
        socket.close();
        reject(error);
      });

      socket.send(Buffer.from(payload, "utf8"), gatewayPort, gatewayHost, (error) => {
        clearTimeout(timer);
        socket.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    return { ok: true };
  } finally {
    try {
      socket.close();
    } catch {
      // ignore double-close
    }
  }
}

export async function updatePatrolTaskStatus(options) {
  const {
    cloudBaseUrl,
    taskId,
    deviceKey,
    status,
    errorMessage,
    fetchImpl = fetch
  } = options;

  if (!cloudBaseUrl) throw new Error("cloudBaseUrl is required");
  if (!taskId) throw new Error("taskId is required");
  if (!deviceKey) throw new Error("deviceKey is required");
  if (!status) throw new Error("status is required");

  const response = await fetchImpl(
    `${cloudBaseUrl.replace(/\/$/, "")}/api/patrol-tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": deviceKey
      },
      body: JSON.stringify({
        status,
        errorMessage
      })
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Patrol task status update failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function bridgePatrolOnce(options) {
  const pending = await pollPendingPatrolTasks(options);
  const tasks = Array.isArray(pending.tasks) ? pending.tasks : [];
  const processed = [];
  const sendStep = options.sendStep ?? sendPatrolStep;
  const stepDelayMs = Number(options.stepDelayMs ?? 100);

  for (const task of tasks) {
    try {
      const running = await updatePatrolTaskStatus({
        cloudBaseUrl: options.cloudBaseUrl,
        taskId: task.id,
        deviceKey: options.deviceKey,
        status: "running",
        fetchImpl: options.fetchImpl
      });
      const steps = normalizePatrolSteps(task);
      for (const step of steps) {
        await sendStep({
          gatewayHost: options.gatewayHost,
          gatewayPort: options.gatewayPort,
          payload: patrolStepToPayload(step),
          timeoutMs: options.timeoutMs
        });
        if (stepDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
        }
      }
      const completed = await updatePatrolTaskStatus({
        cloudBaseUrl: options.cloudBaseUrl,
        taskId: task.id,
        deviceKey: options.deviceKey,
        status: "completed",
        fetchImpl: options.fetchImpl
      });
      processed.push({ task, running, completed });
    } catch (error) {
      const failed = await updatePatrolTaskStatus({
        cloudBaseUrl: options.cloudBaseUrl,
        taskId: task.id,
        deviceKey: options.deviceKey,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        fetchImpl: options.fetchImpl
      });
      processed.push({ task, failed, error });
    }
  }

  return {
    tasks,
    processed
  };
}
