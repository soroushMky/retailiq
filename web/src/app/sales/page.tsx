"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DollarSign, Info, PackageCheck, Receipt, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, Skeleton } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { ErrorCard, PageHeader } from "@/components/PageParts";
import { api, type PaymentRow, type SalesMonth } from "@/lib/api";
import { useFilteredData, useFilters } from "@/lib/filters";
import { brl, brlAxis, num, pct, prettyCategory } from "@/lib/format";

const GREEN = "#0EB582";
const ORANGE = "#FD7E4C";
const GOLD = "#FBBF24";
const PARTIAL = "#475569";
const TICK = { fill: "#94A3B8", fontSize: 12 };

const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

const METHOD_LABELS: Record<string, string> = {
  credit_card: "Credit card",
  boleto: "Boleto (bank slip)",
  voucher: "Voucher",
  debit_card: "Debit card",
};

// ---------------------------------------------------------------- tooltips
type TipProps<T> = { active?: boolean; payload?: readonly { payload?: T }[] };

function MonthTooltip({ active, payload }: TipProps<SalesMonth>) {
  const m = active ? payload?.[0]?.payload : undefined;
  if (!m) return null;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-muted">
        {m.month}
        {m.is_partial && <span className="ml-2 text-warn">incomplete month</span>}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{brl(m.gmv)}</p>
      <p className="text-muted">{num(m.orders)} delivered orders</p>
      <p className="text-muted">AOV <span className="text-white">{brl(m.aov)}</span></p>
    </div>
  );
}

function MomTooltip({ active, payload }: TipProps<SalesMonth>) {
  const m = active ? payload?.[0]?.payload : undefined;
  if (!m || m.gmv_mom_pct == null) return null;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-muted">{m.month} vs previous month</p>
      <p className={`mt-1 text-sm font-semibold ${m.gmv_mom_pct >= 0 ? "text-brand" : "text-warn"}`}>
        {signedPct(m.gmv_mom_pct)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- payment mix as animated bars
function PaymentMix({ rows }: { rows: PaymentRow[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.method}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span>{METHOD_LABELS[r.method] ?? r.method}</span>
            <span className="tabular-nums text-muted">
              <span className="font-semibold text-white">{pct(r.share_pct, 1)}</span> · {num(r.payments)} payments
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-active">
            <motion.div
              className="h-full rounded-full bg-chart-blue"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${r.share_pct}%` }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function SalesPage() {
  const { error: filtersError } = useFilters();
  const { data, loading, error, retry } = useFilteredData((f, s) =>
    Promise.all([
      api.kpis(f, s),
      api.salesMonthly(f, s),
      api.periodComparison(f, s),
      api.topProducts(f, s),
      api.paymentMix(f, s),
    ]).then(([kpis, monthly, comparison, products, payments]) => ({ kpis, monthly, comparison, products, payments })),
  );

  const shownError = filtersError ?? error;
  const latestMom = data ? [...data.monthly].reverse().find((m) => m.gmv_mom_pct != null) : undefined;
  const momRows = data ? data.monthly.filter((m) => m.gmv_mom_pct != null) : [];
  const hasPartial = data?.monthly.some((m) => m.is_partial) ?? false;
  const cmp = data?.comparison;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Sales" subtitle="How GMV, orders and order value develop over time" />

      {shownError ? (
        <ErrorCard message={shownError} onRetry={retry} />
      ) : !data ? (
        <div className="space-y-6">
          <Skeleton className="h-[150px]" />
          <Skeleton className="h-[132px]" />
          <Skeleton className="h-[420px]" />
        </div>
      ) : (
        <div aria-busy={loading} className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-60" : ""}`}>
          {/* ------------------------------------------------ like-for-like growth */}
          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand">Like-for-like growth</p>
            {cmp?.available ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                  GMV{" "}
                  <span className={cmp.gmv_growth_pct != null && cmp.gmv_growth_pct < 0 ? "text-warn" : "text-brand"}>
                    {cmp.gmv_growth_pct != null ? signedPct(cmp.gmv_growth_pct) : "–"}
                  </span>{" "}
                  year on year
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {cmp.label}: {brl(cmp.current_gmv, true)} vs {brl(cmp.previous_gmv, true)} in delivered GMV. Delivered
                  orders changed {cmp.orders_growth_pct != null ? signedPct(cmp.orders_growth_pct) : "–"} (
                  {num(cmp.current_orders)} vs {num(cmp.previous_orders)}). Only the {cmp.months} months that are
                  complete in both years are compared.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">No year-on-year comparison for this range</h2>
                <p className="mt-3 text-sm text-muted">
                  Pick a range that covers the same months in two consecutive years (for example 2017-01 → 2018-08).
                </p>
              </>
            )}
          </Card>

          {/* ------------------------------------------------ KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard index={0} highlight label="Delivered GMV" icon={DollarSign} value={data.kpis.gmv}
                     format={(v) => brl(v, true)}
                     help="Sum of item prices on delivered orders in the selected range, excluding freight." />
            <KpiCard index={1} label="Delivered orders" icon={PackageCheck} value={data.kpis.delivered_orders} format={num}
                     help="Orders with status 'delivered' in the selected range." />
            <KpiCard index={2} label="Avg order value" icon={Receipt} value={data.kpis.aov} format={(v) => brl(v)}
                     help="Delivered GMV ÷ delivered orders that contain items." />
            <KpiCard index={3} label={`MoM · ${latestMom?.month ?? "–"}`} icon={TrendingUp}
                     value={latestMom?.gmv_mom_pct ?? null} format={signedPct}
                     help="GMV change of the latest complete month vs the month before it. Not shown for incomplete months." />
          </div>

          {/* ------------------------------------------------ monthly GMV + AOV */}
          <Card delay={0.2}>
            <h2 className="text-lg font-semibold">Monthly GMV and average order value</h2>
            <div className="mb-5 mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> GMV (left axis)</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#FBBF24]" /> Avg order value (right axis)</span>
              {hasPartial && (
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#475569]" /> Incomplete month</span>
              )}
            </div>
            <div className="h-80" role="img" aria-label="Monthly GMV bars with average order value line">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#26304F" />
                  <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis yAxisId="gmv" tick={TICK} tickLine={false} axisLine={false} width={72} tickFormatter={brlAxis} />
                  <YAxis yAxisId="aov" orientation="right" tick={TICK} tickLine={false} axisLine={false} width={64}
                         domain={[0, (max: number) => Math.ceil(max * 1.3)]} tickFormatter={(v: number) => `R$ ${Math.round(v)}`} />
                  <Tooltip cursor={{ fill: "#1C2646" }} content={<MonthTooltip />} />
                  <Bar yAxisId="gmv" dataKey="gmv" radius={[6, 6, 0, 0]} animationDuration={700}>
                    {data.monthly.map((m) => (
                      <Cell key={m.month} fill={m.is_partial ? PARTIAL : GREEN} />
                    ))}
                  </Bar>
                  <Line yAxisId="aov" type="linear" dataKey="aov" stroke={GOLD} strokeWidth={2}
                        dot={{ r: 2.5, fill: GOLD, strokeWidth: 0 }} animationDuration={700} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {hasPartial && (
              <p className="mt-3 text-xs text-muted">
                Grey bars are incomplete months (the dataset starts in Sep 2016 and stops in mid-Oct 2018). Don&apos;t
                read them as real drops.
              </p>
            )}
          </Card>

          {/* ------------------------------------------------ month-over-month */}
          <Card delay={0.3}>
            <h2 className="text-lg font-semibold">Month-over-month GMV change</h2>
            <p className="mb-5 mt-1 text-xs text-muted">
              Only between two complete months. The first month of the range has nothing to compare with.
            </p>
            {momRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Select at least two complete months.</p>
            ) : (
              <div className="h-64" role="img" aria-label="Month-over-month percentage change in GMV">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={momRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#26304F" />
                    <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `${v}%`} />
                    <ReferenceLine y={0} stroke="#94A3B8" />
                    <Tooltip cursor={{ fill: "#1C2646" }} content={<MomTooltip />} />
                    <Bar dataKey="gmv_mom_pct" radius={[4, 4, 4, 4]} animationDuration={700}>
                      {momRows.map((m) => (
                        <Cell key={m.month} fill={(m.gmv_mom_pct ?? 0) >= 0 ? GREEN : ORANGE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* ------------------------------------------------ products + payments */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card delay={0.4}>
              <h2 className="text-lg font-semibold">Top 20 products by GMV</h2>
              <p className="mb-4 mt-1 text-xs text-muted">Olist anonymised product names, so products are shown by ID.</p>
              <div className="max-h-[440px] overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-active/95 text-muted backdrop-blur">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">#</th>
                      <th className="px-3 py-2.5 text-left font-medium">Product</th>
                      <th className="px-3 py-2.5 text-left font-medium">Category</th>
                      <th className="px-3 py-2.5 text-right font-medium">GMV</th>
                      <th className="px-3 py-2.5 text-right font-medium">Units</th>
                      <th className="px-3 py-2.5 text-right font-medium">Avg price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p, i) => (
                      <tr key={p.product + p.category} className="border-t border-line/60 hover:bg-active/50">
                        <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.product}</td>
                        <td className="px-3 py-2">{prettyCategory(p.category)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(p.gmv, true)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(p.units)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{brl(p.avg_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card delay={0.5}>
              <h2 className="text-lg font-semibold">Payment mix</h2>
              <p className="mb-5 mt-1 text-xs text-muted">Share of payment value on delivered orders.</p>
              <PaymentMix rows={data.payments} />
            </Card>
          </div>

          <div className="flex gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted backdrop-blur-xl">
            <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <p>
              <span className="font-medium text-white">GMV is not revenue.</span> It is the value of items sold on
              delivered orders, excluding freight. Olist&apos;s own revenue is its commission on that value, which this
              dataset doesn&apos;t include.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
