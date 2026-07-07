import type { AgentReport } from "../api";
import { api } from "../api";
import { RiskBadge } from "../components/Primitives";
import { normalizeReport } from "../utils";

export function AgentView({
  token,
  deviceId,
  reports,
  onRefresh
}: {
  token: string;
  deviceId: string;
  reports: AgentReport[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Agent 分析记录</h2>
        <button onClick={async () => { await api.createReport(token, deviceId); await onRefresh(); }}>重新分析</button>
      </div>
      <div className="report-list">
        {reports.map((report, index) => {
          const normalized = normalizeReport(report);
          return (
            <article key={report.id ?? index}>
              <RiskBadge level={normalized.level} />
              <p>{normalized.summary}</p>
              <small>{normalized.time}</small>
              {normalized.suggestions.map((item) => <span className="pill" key={item}>{item}</span>)}
            </article>
          );
        })}
      </div>
    </section>
  );
}
