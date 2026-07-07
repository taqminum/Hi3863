import type { Reading } from "../api";
import { Chart } from "../components/Primitives";

export function HistoryView({ readings }: { readings: Reading[] }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>历史趋势</h2>
          <p className="muted">展示最近一段时间的环境采样，用于验收云端、Web 和 APK 数据一致性。</p>
        </div>
      </div>
      <Chart readings={readings} field="temperature" color="#ff6b4a" label="温度" />
      <Chart readings={readings} field="humidity" color="#00e6a8" label="湿度" />
      <Chart readings={readings} field="lightness" color="#f6c85f" label="光照" />
    </section>
  );
}
