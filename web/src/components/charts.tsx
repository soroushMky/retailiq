"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendRow } from "@/lib/api";
import { brl, brlAxis, num } from "@/lib/format";

const TICK = { fill: "#94A3B8", fontSize: 12 };

// ---------------------------------------------------------------- shared tooltip
type TooltipProps = {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  format: (v: number) => string;
  labelFormat?: (s: string) => string;
};

function ChartTooltip({ active, payload, label, format, labelFormat }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const name = String(label ?? "");
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 shadow-2xl backdrop-blur">
      <p className="text-xs text-muted">{labelFormat ? labelFormat(name) : name}</p>
      <p className="text-sm font-semibold tabular-nums text-white">{format(Number(payload[0].value))}</p>
    </div>
  );
}

// ---------------------------------------------------------------- monthly trend with a metric switch
const METRICS = [
  { key: "gmv", label: "GMV", format: (v: number) => brl(v, true) },
  { key: "orders", label: "Orders", format: (v: number) => num(v) },
  { key: "aov", label: "Avg order value", format: (v: number) => brl(v) },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function TrendChart({ data }: { data: TrendRow[] }) {
  const [metric, setMetric] = useState<MetricKey>("gmv");
  const current = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Monthly trend</h2>

        <div role="tablist" aria-label="Metric" className="flex rounded-xl border border-line bg-page p-1">
          {METRICS.map((m) => {
            const selected = m.key === metric;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMetric(m.key)}
                className="relative rounded-lg px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-brand"
              >
                {selected && (
                  <motion.span
                    layoutId="metric-pill"
                    className="absolute inset-0 rounded-lg bg-brand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={`relative ${selected ? "font-medium text-ink-on-accent" : "text-muted hover:text-white"}`}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-72" role="img" aria-label={`Bar chart of monthly ${current.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#26304F" />
            <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(v: number) => (metric === "orders" ? num(v) : brlAxis(v))}
            />
            <Tooltip cursor={{ fill: "#1C2646" }} content={<ChartTooltip format={current.format} />} />
            <Bar dataKey={metric} fill="#0EB582" radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted">Delivered orders only. GMV = item prices, excluding freight.</p>
    </div>
  );
}

// ---------------------------------------------------------------- reusable horizontal bar chart
// ---------------------------------------------------------------- reusable horizontal bar chart
type HBarProps<T> = {
  data: T[];
  labelKey: keyof T & string;
  valueKey: keyof T & string;
  color: string;
  format: (v: number) => string;
  labelFormat?: (s: string) => string;
  ariaLabel: string;
  onBarClick?: (row: T) => void;   // optional: makes bars clickable (cross-filtering)
};

export function HBarChart<T extends object>({
  data, labelKey, valueKey, color, format, labelFormat, ariaLabel, onBarClick,
}: HBarProps<T>) {
  return (
    <div style={{ height: Math.max(240, data.length * 34) }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey={labelKey as never}
            width={160}
            tick={{ fill: "#E2E8F0", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={labelFormat}
          />
          <Tooltip
            cursor={{ fill: "#1C2646" }}
            content={<ChartTooltip format={format} labelFormat={labelFormat} />}
          />
          <Bar
            dataKey={valueKey as never}
            fill={color}
            radius={[0, 6, 6, 0]}
            barSize={18}
            animationDuration={700}
            style={onBarClick ? { cursor: "pointer" } : undefined}
            onClick={onBarClick ? (_entry: unknown, index: number) => onBarClick(data[index]) : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}