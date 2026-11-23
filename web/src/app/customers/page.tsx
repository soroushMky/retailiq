"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Info, Repeat, ShoppingBag, UserCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Skeleton } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { ErrorCard, PageHeader } from "@/components/PageParts";
import { api, type Cohorts, type FrequencyRow, type HeatCell, type SegmentRow } from "@/lib/api";
import { useFilteredData, useFilters } from "@/lib/filters";
import { brl, num, pct } from "@/lib/format";

const TICK = { fill: "#94A3B8", fontSize: 12 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Blend two hex colours; t = 0..1 */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// ---------------------------------------------------------------- repeat vs one-time
function Compare({ label, repeat, oneTime, format }: {
  label: string; repeat: number; oneTime: number; format: (v: number) => string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(repeat, oneTime, 1);
  const rows = [
    { name: "Repeat", value: repeat, color: "bg-brand" },
    { name: "One-time", value: oneTime, color: "bg-chart-blue" },
  ];
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{label}</p>
      {rows.map((r) => (
        <div key={r.name} className="mb-2.5 flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs text-muted">{r.name}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-active">
            <motion.div
              className={`h-full rounded-full ${r.color}`}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="w-24 text-right text-sm font-semibold tabular-nums">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- orders per customer
type TipProps<T> = { active?: boolean; payload?: readonly { payload?: T }[] };

function FrequencyTooltip({ active, payload }: TipProps<FrequencyRow>) {
  const r = active ? payload?.[0]?.payload : undefined;
  if (!r) return null;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-muted">{r.orders_per_customer} order{r.orders_per_customer === "1" ? "" : "s"}</p>
      <p className="text-sm font-semibold text-white">{num(r.customers)} customers</p>
    </div>
  );
}

// ---------------------------------------------------------------- cohort retention table
function CohortTable({ data }: { data: Cohorts }) {
  const max = Math.max(0.0001, ...data.rows.flatMap((r) => r.cells.filter((c): c is number => c != null)));
  const ks = Array.from({ length: data.max_k }, (_, i) => i + 1);

  if (data.rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No complete cohorts in the selected range.</p>;
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 bg-active/95 text-muted backdrop-blur">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">First order</th>
            <th className="px-3 py-2.5 text-right font-medium">Customers</th>
            {ks.map((k) => (
              <th key={k} className="px-3 py-2.5 text-center font-medium">Month {k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.cohort} className="border-t border-line/60">
              <td className="px-3 py-1.5 font-medium">{r.cohort}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted">{num(r.size)}</td>
              {r.cells.map((c, i) =>
                c == null ? (
                  <td key={i} className="px-1 py-1">
                    <span
                      title="Not observed yet: the data ends before this month"
                      className="block rounded-md bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(148,163,184,0.12)_4px,rgba(148,163,184,0.12)_8px)] py-1.5 text-center text-muted/50"
                    >
                      –
                    </span>
                  </td>
                ) : (
                  <td key={i} className="px-1 py-1">
                    <span
                      className="block rounded-md py-1.5 text-center tabular-nums text-white"
                      style={{ background: mix("#1C2646", "#0EB582", Math.sqrt(c / max)) }}
                    >
                      {c.toFixed(2)}%
                    </span>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- weekday x hour heatmap
function PurchaseHeatmap({ cells }: { cells: HeatCell[] }) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    cells.forEach((c) => {
      g[c.weekday - 1][c.hour] = c.orders;
    });
    return g;
  }, [cells]);
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const peak = cells.reduce<HeatCell | null>((best, c) => (!best || c.orders > best.orders ? c : best), null);

  return (
    <div>
      <p className="mb-4 h-5 text-sm text-muted" aria-live="polite">
        {hover
          ? <>
              <span className="font-medium text-white">{DAYS[hover.weekday - 1]} {String(hover.hour).padStart(2, "0")}:00</span>{" "}
              · {num(hover.orders)} orders
            </>
          : peak && <>Busiest hour: <span className="font-medium text-white">{DAYS[peak.weekday - 1]} {String(peak.hour).padStart(2, "0")}:00</span> ({num(peak.orders)} orders). Hover a cell for its count.</>}
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {grid.map((row, d) => (
            <div key={d} className="mb-1 flex items-center gap-1">
              <span className="w-9 shrink-0 text-xs text-muted">{DAYS[d]}</span>
              {row.map((v, h) => (
                <div
                  key={h}
                  onMouseEnter={() => setHover({ weekday: d + 1, hour: h, orders: v })}
                  onMouseLeave={() => setHover(null)}
                  className="h-7 flex-1 rounded-[4px] transition-transform hover:scale-110 hover:ring-1 hover:ring-white/60"
                  style={{ background: mix("#18213C", "#0EB582", v / max) }}
                  aria-label={`${DAYS[d]} ${h}:00, ${v} orders`}
                />
              ))}
            </div>
          ))}
          <div className="mt-1 flex gap-1 pl-10">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="flex-1 text-center text-[10px] text-muted">
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Hour of purchase, Brazil time. Brighter = more orders.</p>
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function CustomersPage() {
  const { error: filtersError } = useFilters();
  const { data, loading, error, retry } = useFilteredData((f, s) =>
    Promise.all([api.customerKpis(f, s), api.segments(f, s), api.frequency(f, s), api.heatmap(f, s), api.cohorts(f, s)])
      .then(([kpis, segments, frequency, heatmap, cohorts]) => ({ kpis, segments, frequency, heatmap, cohorts })),
  );

  const shownError = filtersError ?? error;
  const repeat = data?.segments.find((s: SegmentRow) => s.segment === "Repeat");
  const oneTime = data?.segments.find((s: SegmentRow) => s.segment === "One-time");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Customers" subtitle="Who comes back, how often, and when people buy" />

      {shownError ? (
        <ErrorCard message={shownError} onRetry={retry} />
      ) : !data ? (
        <div className="space-y-6">
          <Skeleton className="h-[240px]" />
          <Skeleton className="h-[132px]" />
          <Skeleton className="h-[420px]" />
        </div>
      ) : (
        <div aria-busy={loading} className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-60" : ""}`}>
          {/* ------------------------------------------------ key finding */}
          <Card>
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-warn">Key finding</p>
                <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                  Only <span className="text-warn">{pct(data.kpis.repeat_rate, 1)}</span> of customers ordered more than once
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {num(data.kpis.repeat_customers)} of {num(data.kpis.customers)} people placed a second order in the
                  selected range. Repeat customers spend more in total because they buy more often; compare their
                  average order value to see whether each order is also bigger.
                </p>
              </div>
              {repeat && oneTime ? (
                <div className="space-y-6">
                  <Compare label="Average delivered GMV per customer" repeat={repeat.avg_spend_per_customer}
                           oneTime={oneTime.avg_spend_per_customer} format={(v) => brl(v)} />
                  <Compare label="Average order value" repeat={repeat.aov ?? 0} oneTime={oneTime.aov ?? 0}
                           format={(v) => brl(v)} />
                </div>
              ) : (
                <p className="text-sm text-muted">Not enough repeat customers in this selection to compare.</p>
              )}
            </div>
          </Card>

          {/* ------------------------------------------------ KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard index={0} label="Unique customers" icon={Users} value={data.kpis.customers} format={num}
                     help="Distinct people (customer_unique_id) with at least one order in the range." />
            <KpiCard index={1} label="Repeat customers" icon={UserCheck} value={data.kpis.repeat_customers} format={num}
                     help="People with more than one order inside the selected range." />
            <KpiCard index={2} label="Repeat rate" icon={Repeat} value={data.kpis.repeat_rate} format={(v) => pct(v)}
                     help="Repeat customers ÷ unique customers, inside the selected range. This is NOT cohort retention." />
            <KpiCard index={3} label="Orders per customer" icon={ShoppingBag} value={data.kpis.avg_orders}
                     format={(v) => v.toFixed(3)} help="Orders ÷ unique customers in the range." />
          </div>

          {/* ------------------------------------------------ frequency + heatmap */}
          <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
            <Card delay={0.2}>
              <h2 className="text-lg font-semibold">Orders per customer</h2>
              <p className="mb-5 mt-1 text-xs text-muted">Log scale: one-time buyers would otherwise hide everything else.</p>
              <div className="h-72" role="img" aria-label="Number of customers by how many orders they placed">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.frequency} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#26304F" />
                    <XAxis dataKey="orders_per_customer" tick={TICK} tickLine={false} axisLine={false}
                           tickFormatter={(v: string) => `${v} order${v === "1" ? "" : "s"}`} />
                    <YAxis scale="log" domain={[1, 100000]} ticks={[1, 10, 100, 1000, 10000, 100000]} allowDataOverflow
                           width={56} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
                    <Tooltip cursor={{ fill: "#1C2646" }} content={<FrequencyTooltip />} />
                    <Bar dataKey="customers" fill="#374A86" radius={[6, 6, 0, 0]} animationDuration={700}>
                      <LabelList dataKey="customers" position="top" fill="#94A3B8" fontSize={11}
                                 formatter={(v: unknown) => num(Number(v))} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card delay={0.3}>
              <h2 className="text-lg font-semibold">When do customers buy?</h2>
              <p className="mb-2 mt-1 text-xs text-muted">Orders by weekday and hour of purchase.</p>
              <PurchaseHeatmap cells={data.heatmap} />
            </Card>
          </div>

          {/* ------------------------------------------------ cohorts */}
          <Card delay={0.4}>
            <h2 className="text-lg font-semibold">Cohort retention</h2>
            <p className="mb-5 mt-1 text-xs leading-relaxed text-muted">
              Each row is a group of customers whose <span className="text-white">first ever order</span> was in that month.
              Each cell is the % of them who ordered again exactly N months later. Striped cells are{" "}
              <span className="text-white">not observed yet</span> (the complete data ends in {data.cohorts.data_end}),
              which is different from 0%.
            </p>
            <CohortTable data={data.cohorts} />
          </Card>

          <div className="flex gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted backdrop-blur-xl">
            <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <p>
              <span className="font-medium text-white">Repeat rate is not retention.</span> The repeat rate only counts
              orders inside the selected dates. Retention follows each monthly cohort forward from its first order,
              so it answers &quot;do new customers come back?&quot;. Both are low for Olist, a marketplace where most
              people buy once.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
