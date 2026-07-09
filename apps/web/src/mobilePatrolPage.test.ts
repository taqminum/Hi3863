import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobilePatrolPage } from "./mobile/patrol/MobilePatrolPage.ts";
import type { MobilePatrolModel } from "./mobile/patrol/mobilePatrolModel.ts";

const model: MobilePatrolModel = {
  deviceName: "WS63E 环境巡检小车 001",
  baseStationName: "H3863 星闪基站 在线",
  signalLabel: "-- dBm",
  routeTemplates: [
    {
      id: "firmware-precheck",
      label: "固件预检线路",
      name: "预检线路",
      steps: [{ action: "forward", speed: 45, durationMs: 2000 }]
    }
  ],
  selectedTemplateId: "firmware-precheck",
  defaultTaskName: "预检线路",
  estimatedDurationLabel: "约 7.7s",
  canCreate: true,
  disabledReason: "",
  primaryActionLabel: "一键下发任务",
  cards: [
    {
      id: "task-1",
      kind: "cloud",
      name: "预检线路",
      status: "running",
      statusLabel: "执行中",
      detail: "前进 45% 2s",
      timeLabel: "16:00:03",
      baseStationId: "sle-base-001"
    }
  ],
  timeline: [
    { title: "任务已创建", meta: "16:00:00", state: "done" },
    { title: "基站已拉取", meta: "任务已进入基站侧队列", state: "done" },
    { title: "线路执行中", meta: "前进 45% 2s", state: "active" },
    { title: "等待完成回执", meta: "等待完成", state: "idle" }
  ],
  timelineStatusLabel: "执行中",
  notice: ""
};

test("renders a React clone of the mobile patrol three-column page", () => {
  const html = renderToStaticMarkup(
    createElement(MobilePatrolPage, {
      model,
      taskName: "预检线路",
      templateId: "firmware-precheck",
      onTaskNameChange: () => undefined,
      onTemplateChange: () => undefined,
      onCreate: () => undefined,
      onRefresh: () => undefined,
      onStop: () => undefined
    })
  );

  assert.match(html, /mobile-patrol-page/);
  assert.match(html, /mobile-patrol-layout/);
  assert.match(html, /新建任务/);
  assert.match(html, /任务队列 \(1\)/);
  assert.match(html, /执行步骤追踪/);
  assert.match(html, /WS63E 环境巡检小车 001/);
  assert.match(html, /一键下发任务/);
  assert.match(html, /线路执行中/);
});
