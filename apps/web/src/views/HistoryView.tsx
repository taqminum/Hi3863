import type { Reading } from "../api";
import { Chart } from "../components/Primitives";

export function HistoryView({ readings }: { readings: Reading[] }) {
  return (
    <section className="panel">
      <h2>历史趋势</h2>
      <Chart readings={readings} field="temperature" color="#d45a4c" label="温度" />
      <Chart readings={readings} field="humidity" color="#2f9e8f" label="湿度" />
      <Chart readings={readings} field="lightness" color="#c89532" label="光照" />
    </section>
  );
}
