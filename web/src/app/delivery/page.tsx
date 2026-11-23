"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Clock, Info, MousePointerClick, Star, ThumbsDown, Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Skeleton } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { ErrorCard, PageHeader } from "@/components/PageParts";
import { api, type DaysRow, type LateRegionRow, type StatusRow } from "@/lib/api";
import { useFilteredData, useFilters } from "@/lib/filters";
import { num, pct, score } from "@/lib/format";

const GREEN = "#0EB582";
const ORANGE = "#FD7E4C";
const TICK = { fill: "#94A3B8", fontSize: 12 };

// ---------------------------------------------------------------- tooltips
type TipProps<T> = { active?: boolean; payload?: readonly { payload?: T }[] };

function DaysTooltip({ active, payload }: TipProps<DaysRow>) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const d = row.days_vs_promise;
  const when =
    d === 0 ? "On the promised day"
    : d < 0 ? `${Math.abs(d)}${d <= -20 ? "+" : ""} days early`
    : `${d}${d >= 20 ? "+" : ""} days late`;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-muted">{when}</p>
      <p className="mt-1 text-sm font-semibold text-white">{score(row.avg_review)}</p>
      <p className="text-muted">{num(row.orders)} orders</p>
    </div>
  );
}

function StateTooltip({ active, payload }: TipProps<LateRegionRow>) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-sm font-semibold text-white">{row.region_name}</p>
      <p className="mt-1 text-muted">Late: <span className="text-white">{pct(row.late_rate, 1)}</span></p>
      <p className="text-muted">Avg delivery: <span className="text-white">{row.avg_delivery_days.toFixed(1)} days</span></p>
      <p className="text-muted">Avg review: <span className="text-white">{score(row.avg_review)}</span></p>
      <p className="text-muted">{num(row.delivered_orders)} delivered orders</p>
    </div>
  );
}

// ---------------------------------------------------------------- on time vs late, as two animated bars
function Versus({ label, onTime, late, max, format }: {
  label: string; onTime: number; late: number; max: number; format: (v: number) => string;
}) {
  const reduce = useReducedMotion();
  const rows = [
    { name: "On time / early", value: onTime, color: "bg-brand" },
    { name: "Late", value: late, color: "bg-warn" },
  ];
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{label}</p>
      {rows.map((r) => (
        <div key={r.name} className="mb-2.5 flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted">{r.name}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-active">
            <motion.div
              className={`h-full rounded-full ${r.color}`}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.min(100, (r.value / max) * 100)}%` }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="w-16 text-right text-sm font-semibold tabular-nums">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function DeliveryPage() {
  const { filters, setFilters, error: filtersError } = useFilters();
  const { data, loading, error, retry } = useFilteredData((f, s) =>
    Promise.all([
      api.deliveryKpis(f, s),
      api.reviewByStatus(f, s),
      api.reviewByDays(f, s),
      api.lateByRegion({ ...f, regions: [] }, s), // always all states, so the selected one can be compared
    ]).then(([kpis, status, days, states]) => ({ kpis, status, days, states })),
  );

  const selected = filters?.regions.length === 1 ? filters.regions[0] : null;
  const shownError = filtersError ?? error;
  const k = data?.kpis;
  const onTime = data?.status.find((r: StatusRow) => r.delivery === "On time / early");
  const late = data?.status.find((r: StatusRow) => r.delivery === "Late");
  const states = data ? [...data.states].sort((a, b) => b.late_rate - a.late_rate) : [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Delivery & experience" subtitle="How delivery performance relates to customer reviews" />

      {shownError ? (
        <ErrorCard message={shownError} onRetry={retry} />
      ) : (
        <div aria-busy={loading} className={`transition-opacity duration-300 ${loading && data ? "opacity-60" : ""}`}>
          {/* ------------------------------------------------ key finding */}
          {k && onTime && late ? (
            <Card className="mb-6">
              <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-warn">Key finding</p>
                  <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                    Late orders score{" "}
                    <span className="text-warn">{k.review_gap != null ? k.review_gap.toFixed(2) : "–"} stars lower</span>
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {num(k.late_orders)} of {num(k.delivered_measured)} delivered orders ({pct(k.late_rate, 1)}) arrived
                    after the promised date. Their average review was {score(k.review_late)}, compared with{" "}
                    {score(k.review_on_time)} for orders that arrived on time or early.
                  </p>
                </div>
                <div className="space-y-6">
                  <Versus label="Average review (out of 5)" onTime={onTime.avg_review} late={late.avg_review}
                          max={5} format={(v) => v.toFixed(2)} />
                  <Versus label="Share of 1–2 star reviews" onTime={onTime.pct_negative} late={late.pct_negative}
                          max={100} format={(v) => `${v.toFixed(1)}%`} />
                </div>
              </div>
            </Card>
          ) : (
            !data && <Skeleton className="mb-6 h-[260px]" />
          )}

          {/* ------------------------------------------------ KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {k ? (
              <>
                <KpiCard index={0} label="Late rate" icon={Clock} value={k.late_rate} format={(v) => pct(v)}
                         help="Delivered orders that arrived after the estimated date ÷ delivered orders with a delivery date." />
                <KpiCard index={1} label="Avg delivery time" icon={Timer} value={k.avg_delivery_days}
                         format={(v) => `${v.toFixed(1)} days`}
                         help="Days from purchase to customer delivery, delivered orders only." />
                <KpiCard index={2} label="Review: on time" icon={Star} value={k.review_on_time} format={score}
                         help="Average review of orders delivered on or before the estimated date." />
                <KpiCard index={3} label="Review: late" icon={ThumbsDown} value={k.review_late} format={score}
                         help="Average review of orders delivered after the estimated date." />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px]" />)
            )}
          </div>

          {/* ------------------------------------------------ the curve */}
          <div className="mt-6">
            {data ? (
              <Card delay={0.3}>
                <h2 className="text-lg font-semibold">Review score by days vs. the promised date</h2>
                <p className="mb-5 mt-1 text-xs text-muted">
                  Each bar groups delivered orders by how early (left) or late (right) they arrived. Values beyond ±20
                  days are grouped at the edges.
                </p>
                <div className="h-80" role="img" aria-label="Average review score by days early or late">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.days} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#26304F" />
                      <XAxis dataKey="days_vs_promise" tick={TICK} tickLine={false} axisLine={false}
                             tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)} interval={4} />
                      <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={TICK} tickLine={false} axisLine={false} width={32} />
                      <ReferenceLine x={0} stroke="#94A3B8" strokeDasharray="4 4"
                                     label={{ value: "Promised date", fill: "#94A3B8", fontSize: 11, position: "top" }} />
                      <Tooltip cursor={{ fill: "#1C2646" }} content={<DaysTooltip />} />
                      <Bar dataKey="avg_review" radius={[4, 4, 0, 0]} animationDuration={800}>
                        {data.days.map((d) => (
                          <Cell key={d.days_vs_promise} fill={d.days_vs_promise > 0 ? ORANGE : GREEN} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex gap-5 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> On time / early</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warn" /> Late</span>
                </div>
              </Card>
            ) : (
              <Skeleton className="h-[440px]" />
            )}
          </div>

          {/* ------------------------------------------------ late rate by state */}
          <div className="mt-6">
            {data ? (
              <Card delay={0.4}>
                <h2 className="text-lg font-semibold">Late delivery rate by customer state</h2>
                <p className="mb-5 mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <MousePointerClick size={13} aria-hidden />
                  All states are shown for comparison{selected ? "; your selected state is highlighted" : ""}. Click a
                  state to filter the page.
                </p>
                <div style={{ height: Math.max(260, states.length * 30) }} role="img"
                     aria-label="Late delivery rate by Brazilian state">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={states} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="region_name" width={150} tickLine={false} axisLine={false}
                             tick={{ fill: "#E2E8F0", fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "#1C2646" }} content={<StateTooltip />} />
                      <Bar
                        dataKey="late_rate"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                        animationDuration={700}
                        style={{ cursor: "pointer" }}
                        onClick={(_entry: unknown, index: number) =>
                          filters && setFilters({ ...filters, regions: [states[index].region] })
                        }
                        label={{ position: "right", fill: "#94A3B8", fontSize: 11,
                                 formatter: (v: unknown) => `${Number(v).toFixed(1)}%` }}
                      >
                        {states.map((r) => (
                          <Cell key={r.region} fill={ORANGE} fillOpacity={!selected || r.region === selected ? 1 : 0.3} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 text-xs text-muted">
                  States with fewer than 300 delivered orders are hidden: their rates are too unstable to compare.
                </p>
              </Card>
            ) : (
              <Skeleton className="h-[600px]" />
            )}
          </div>

          {/* ------------------------------------------------ honesty */}
          <div className="mt-6 flex gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted backdrop-blur-xl">
            <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <p>
              <span className="font-medium text-white">Correlation, not causation.</span> Late orders get lower reviews,
              but this data can&apos;t prove the delay <em>caused</em> the low score: late orders may also differ in
              product, seller, distance or region.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
