import { useState } from "react";
import { api, type DeviceRecord } from "../api";

interface ExportPreview {
  name: string;
  mimeType: string;
  content: string;
}

export function BackendDebug({
  token,
  device,
  onNotice,
  onRefresh
}: {
  token: string;
  device?: DeviceRecord;
  onNotice: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<ExportPreview | null>(null);

  async function createCommand() {
    if (!device) return;
    const result = await api.command(token, {
      deviceId: device.id,
      baseStationId: device.base_station_id,
      action: "forward",
      speed: 30
    });
    onNotice(`验收命令已创建：${result.command.payload}`);
    await onRefresh();
  }

  async function createPatrol() {
    if (!device) return;
    await api.createPatrol(token, {
      deviceId: device.id,
      baseStationId: device.base_station_id,
      name: "验收巡检",
      steps: [
        { action: "forward", speed: 30, durationMs: 1200 },
        { action: "stop", speed: 0, durationMs: 500 }
      ]
    });
    onNotice("验收巡检已创建");
    await onRefresh();
  }

  async function createAgentReport() {
    if (!device) return;
    await api.createReport(token, device.id);
    onNotice("Agent 验收报告已生成");
    await onRefresh();
  }

  async function previewReadingsCsv() {
    if (!device) return;
    setPreview({
      name: "readings.csv",
      mimeType: "text/csv",
      content: await api.exportReadingsCsv(token, device.id)
    });
    onNotice("readings.csv 已加载到应用内预览");
  }

  async function previewSummaryJson() {
    setPreview({
      name: "summary.json",
      mimeType: "application/json",
      content: await api.exportSummaryJson(token, device?.id ?? "ws63-car-001")
    });
    onNotice("summary.json 已加载到应用内预览");
  }

  async function copyPreview() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.content);
      onNotice(`${preview.name} 已复制`);
    } catch {
      onNotice("当前环境不允许直接复制，可长按预览内容手动复制");
    }
  }

  function downloadPreview() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([preview.content], { type: preview.mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = preview.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>后端验收</h2>
          <p className="muted">用于快速验证 dashboard、命令队列、巡检任务、Agent 和导出接口。</p>
        </div>
      </div>
      <div className="control-grid">
        <button onClick={onRefresh}>刷新总览</button>
        <button onClick={createCommand} disabled={!device}>创建命令</button>
        <button onClick={createPatrol} disabled={!device}>创建巡检</button>
        <button onClick={createAgentReport} disabled={!device}>生成 Agent</button>
        <button onClick={previewReadingsCsv} disabled={!device}>预览 readings.csv</button>
        <button onClick={previewSummaryJson}>预览 summary.json</button>
      </div>
      <div className="compact-list">
        <span>当前设备：{device?.id ?? "未选择"}</span>
        <span>绑定基站：{device?.base_station_id ?? "未选择"}</span>
      </div>
      {preview && (
        <div className="export-preview">
          <div className="panel-head">
            <h2>{preview.name}</h2>
            <div className="inline-actions">
              <button onClick={copyPreview}>复制</button>
              <button onClick={downloadPreview}>下载</button>
            </div>
          </div>
          <textarea readOnly value={preview.content} />
        </div>
      )}
    </section>
  );
}
