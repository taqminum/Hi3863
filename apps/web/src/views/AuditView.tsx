import type { AuditLog } from "../api";
import { formatTime } from "../utils";

export function AuditView({ audits }: { audits: AuditLog[] }) {
  return (
    <section className="panel">
      <h2>权限与审计</h2>
      <div className="table audit-table">
        {audits.map((log) => (
          <div className="tr" key={log.id}>
            <span>{log.action}</span>
            <b>{log.target_type}{log.target_id ? ` · ${log.target_id}` : ""}</b>
            <time>{formatTime(log.created_at)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}
