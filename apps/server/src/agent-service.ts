import OpenAI from "openai";
import { getConfig } from "./config.ts";
import { createAgentReport, type AgentEvidence, type AgentReport, type SensorReading } from "./domain.ts";

export interface MissingInterval {
  from: string;
  to: string;
  durationMs: number;
}

export interface HistoryAgentRequest {
  deviceId: string;
  range: {
    from: string;
    to: string;
  };
  readings: SensorReading[];
  missingIntervals?: MissingInterval[];
  source?: string;
  modelClient?: AgentModelClient;
}

export type AgentModelClient = (input: {
  deviceId: string;
  range: HistoryAgentRequest["range"];
  readings: SensorReading[];
  missingIntervals: MissingInterval[];
  source?: string;
}) => Promise<AgentReport>;

function clampRiskLevel(value: unknown): AgentReport["riskLevel"] {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeEvidence(value: unknown): AgentEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      code: String(item.code ?? "model_evidence"),
      label: String(item.label ?? item.code ?? "model evidence"),
      value: typeof item.value === "number" || typeof item.value === "string" ? item.value : JSON.stringify(item.value ?? ""),
      threshold: typeof item.threshold === "number" || typeof item.threshold === "string" ? item.threshold : undefined
    }));
}

function normalizeModelReport(value: unknown): AgentReport {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const suggestions = Array.isArray(input.suggestions) ? input.suggestions.map(String).filter(Boolean) : [];
  return {
    riskLevel: clampRiskLevel(input.riskLevel ?? input.risk_level),
    summary: String(input.summary || "模型未返回有效摘要，已保留规则分析结果。"),
    suggestions,
    evidence: normalizeEvidence(input.evidence)
  };
}

function appendGapEvidence(report: AgentReport, missingIntervals: MissingInterval[]): AgentReport {
  if (missingIntervals.length === 0) return report;
  const longest = missingIntervals.reduce((max, item) => Math.max(max, item.durationMs), 0);
  const riskLevel = report.riskLevel === "high" || longest < 300_000 ? report.riskLevel : "medium";
  return {
    riskLevel,
    summary: `${report.summary}；存在 ${missingIntervals.length} 段数据缺口`,
    suggestions: [...report.suggestions, "曲线留空区间代表 App 未收到云端历史或本地实时数据，建议结合基站日志确认链路。"],
    evidence: [
      ...report.evidence,
      {
        code: "data_gap",
        label: "数据缺口",
        value: `${Math.round(longest / 1000)}s`,
        threshold: "120s"
      }
    ]
  };
}

function trimReadings(readings: SensorReading[], maxPoints = 120): SensorReading[] {
  if (readings.length <= maxPoints) return readings;
  const step = Math.ceil(readings.length / maxPoints);
  return readings.filter((_, index) => index % step === 0).slice(0, maxPoints);
}

export async function createOpenAIHistoryClient(): Promise<AgentModelClient | null> {
  const config = getConfig();
  if (!config.agent.enabled || !config.agent.apiKey) return null;
  const client = new OpenAI({
    apiKey: config.agent.apiKey,
    baseURL: config.agent.baseUrl
  });

  return async (input) => {
    const compactReadings = trimReadings(input.readings, 120).map((reading) => ({
      t: reading.recordedAt,
      temp: reading.temperature,
      humi: reading.humidity,
      light: reading.lightness,
      rssi: reading.rssi,
      cached: reading.cachedCount,
      status: reading.status,
      source: input.source
    }));
    const completion = await client.chat.completions.create({
      model: config.agent.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是 WS63E 环境巡检小车的数据分析 Agent。",
            "只根据用户提供的历史数据分析，不编造不存在的时间段。",
            "曲线缺口表示手机未收到云端历史或本地实时数据，需要明确提示。",
            "返回严格 JSON：riskLevel(low|medium|high), summary, suggestions(string[]), evidence([{code,label,value,threshold?}])。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            deviceId: input.deviceId,
            range: input.range,
            source: input.source,
            missingIntervals: input.missingIntervals,
            readings: compactReadings
          })
        }
      ]
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    return normalizeModelReport(JSON.parse(text));
  };
}

export async function analyzeHistoryReadings(input: HistoryAgentRequest): Promise<AgentReport> {
  const readings = [...input.readings].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const missingIntervals = input.missingIntervals ?? [];
  const fallback = appendGapEvidence(createAgentReport(readings), missingIntervals);
  const client = input.modelClient ?? await createOpenAIHistoryClient();
  if (!client) return fallback;

  try {
    const report = await client({
      deviceId: input.deviceId,
      range: input.range,
      readings,
      missingIntervals,
      source: input.source
    });
    return appendGapEvidence(report, missingIntervals);
  } catch {
    return fallback;
  }
}
