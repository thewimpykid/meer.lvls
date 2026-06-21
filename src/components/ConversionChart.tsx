"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface RatePoint {
  date: string;
  ratio: number;
  nq_close: number;
  qqq_close: number;
}

interface Props {
  data: RatePoint[];
  selectedDate: string | null;
  onDateClick: (date: string) => void;
}

function fmt(d: string) {
  return d.slice(2, 7).replace("-", "/"); // "24/03"
}

export default function ConversionChart({ data, selectedDate, onDateClick }: Props) {
  const handleClick = (payload: { activePayload?: { payload: RatePoint }[] }) => {
    if (payload?.activePayload?.[0]) {
      onDateClick(payload.activePayload[0].payload.date);
    }
  };

  const selectedRatio = data.find((d) => d.date === selectedDate)?.ratio;

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label text-xs tracking-widest uppercase">NQ / QQQ Conversion Ratio</span>
        {selectedRatio && (
          <span className="text-accent font-mono text-sm">
            {selectedDate} → <span className="text-white font-semibold">{selectedRatio.toFixed(3)}×</span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} onClick={handleClick} style={{ cursor: "crosshair" }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
          <XAxis
            dataKey="date"
            tickFormatter={fmt}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#1e2535" }}
            interval={Math.floor(data.length / 12)}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#1e2535" }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => v.toFixed(1)}
            width={42}
          />
          <Tooltip
            labelFormatter={(l) => `Date: ${l}`}
            formatter={(v: number, name: string) => {
              if (name === "ratio") return [v.toFixed(4), "NQ/QQQ ratio"];
              return [v.toLocaleString(), name];
            }}
            contentStyle={{ background: "#161b27", border: "1px solid #1e2535", borderRadius: 6 }}
            labelStyle={{ color: "#9ca3af" }}
            itemStyle={{ color: "#e5e7eb" }}
          />
          {selectedDate && (
            <ReferenceLine x={selectedDate} stroke="#3b82f6" strokeDasharray="4 2" strokeWidth={1.5} />
          )}
          <Line
            type="monotone"
            dataKey="ratio"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-muted text-xs mt-2">Click any point to load that date&apos;s options chain.</p>
    </div>
  );
}
