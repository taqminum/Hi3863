import { createElement, type ChangeEvent, type ReactElement } from "react";
import { Activity, Cpu, List, PlusCircle, RadioTower, RefreshCcw, Send, Square } from "lucide-react";
import type { MobilePatrolModel, MobilePatrolRouteTemplate } from "./mobilePatrolModel";

export interface MobilePatrolPageProps {
  model: MobilePatrolModel;
  taskName: string;
  templateId: MobilePatrolRouteTemplate["id"];
  onTaskNameChange: (value: string) => void;
  onTemplateChange: (value: MobilePatrolRouteTemplate["id"]) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onStop: () => void;
}

export function MobilePatrolPage({
  model,
  taskName,
  templateId,
  onTaskNameChange,
  onTemplateChange,
  onCreate,
  onRefresh,
  onStop
}: MobilePatrolPageProps): ReactElement {
  return createElement(
    "main",
    { className: "mobile-patrol-page" },
    createElement(
      "div",
      { className: "mobile-patrol-layout" },
      createElement(
        "section",
        { className: "mobile-patrol-panel" },
        createElement(
          "header",
          { className: "mobile-patrol-panel-header" },
          createElement("span", null, "新建任务"),
          createElement(
            "div",
            { className: "mobile-patrol-header-actions" },
            createElement("button", { type: "button", onClick: onRefresh, title: "刷新" }, createElement(RefreshCcw, { size: 14 }), "刷新"),
            createElement("button", { type: "button", onClick: onStop, title: "停止" }, createElement(Square, { size: 14 }), "停止"),
            createElement(PlusCircle, { size: 16 })
          )
        ),
        createElement(
          "div",
          { className: "mobile-patrol-panel-body" },
          createElement(
            "div",
            { className: "mobile-patrol-status-summary" },
            createElement("div", { className: "mobile-patrol-status-row" }, createElement("span", null, createElement(Cpu, { size: 12 }), "目标小车"), createElement("strong", null, model.deviceName)),
            createElement("div", { className: "mobile-patrol-status-row" }, createElement("span", null, createElement(RadioTower, { size: 12 }), "边缘基站"), createElement("strong", { className: model.baseStationName.includes("在线") ? "online" : "" }, model.baseStationName)),
            createElement("div", { className: "mobile-patrol-status-row" }, createElement("span", null, createElement(Activity, { size: 12 }), "链路信号"), createElement("strong", null, model.signalLabel))
          ),
          createElement(
            "label",
            { className: "mobile-patrol-form-group" },
            createElement("span", null, "任务名称"),
            createElement("input", {
              value: taskName,
              onChange: (event: ChangeEvent<HTMLInputElement>) => onTaskNameChange(event.target.value)
            })
          ),
          createElement(
            "label",
            { className: "mobile-patrol-form-group" },
            createElement("span", null, "预设路线模板"),
            createElement(
              "select",
              {
                value: templateId,
                onChange: (event: ChangeEvent<HTMLSelectElement>) => onTemplateChange(event.target.value as MobilePatrolRouteTemplate["id"])
              },
              ...model.routeTemplates.map((template) => createElement("option", { key: template.id, value: template.id }, template.label))
            )
          ),
          createElement("div", { className: "mobile-patrol-estimate" }, `预计时长 ${model.estimatedDurationLabel}`),
          createElement(
            "button",
            { className: "mobile-patrol-primary", onClick: onCreate, disabled: !model.canCreate },
            createElement(Send, { size: 16 }),
            model.canCreate ? model.primaryActionLabel : model.disabledReason
          )
        )
      ),
      createElement(
        "section",
        { className: "mobile-patrol-panel" },
        createElement("header", { className: "mobile-patrol-panel-header" }, createElement("span", null, `任务队列 (${model.cards.length})`), createElement(List, { size: 16 })),
        createElement(
          "div",
          { className: "mobile-patrol-panel-body mobile-patrol-queue" },
          model.cards.length === 0
            ? createElement("div", { className: "mobile-patrol-empty" }, "等待手机端同步任务")
            : model.cards.map((card) => createElement(
              "article",
              { className: `mobile-patrol-card ${card.status}`, key: card.id },
              createElement("div", { className: "mobile-patrol-card-head" }, createElement("strong", null, card.name), createElement("span", { className: card.kind }, card.statusLabel)),
              createElement("div", { className: "mobile-patrol-card-meta" }, card.detail),
              createElement("div", { className: "mobile-patrol-card-time" }, `${card.timeLabel} · ${card.baseStationId}`)
            ))
        )
      ),
      createElement(
        "section",
        { className: "mobile-patrol-panel" },
        createElement("header", { className: "mobile-patrol-panel-header" }, createElement("span", null, "执行步骤追踪"), createElement("div", { className: "mobile-patrol-timeline-badge" }, model.timelineStatusLabel)),
        createElement(
          "div",
          { className: "mobile-patrol-panel-body" },
          createElement(
            "div",
            { className: "mobile-patrol-timeline" },
            ...model.timeline.map((item) => createElement(
              "div",
              { className: `mobile-patrol-timeline-item ${item.state}`, key: `${item.title}-${item.state}-${item.meta}` },
              createElement("div", { className: "mobile-patrol-timeline-marker" }),
              createElement(
                "div",
                { className: "mobile-patrol-timeline-content" },
                createElement("div", { className: "mobile-patrol-timeline-title" }, item.title),
                createElement("div", { className: "mobile-patrol-timeline-meta" }, item.meta)
              )
            ))
          )
        )
      )
    ),
    model.notice ? createElement("div", { className: "mobile-patrol-notice" }, model.notice) : null
  );
}
