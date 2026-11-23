"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpDown, Info, MousePointerClick, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip,
  XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, Skeleton } from "@/components/Card";
import { ErrorCard, PageHeader } from "@/components/PageParts";
import { api, type CategoryMonthRow, type CategoryPerf, type Quadrant } from "@/lib/api";
import { useFilteredData, useFilters } from "@/lib/filters";
import { brl, brlAxis, num, pct, prettyCategory } from "@/lib/format";

const TICK = { fill: "#94A3B8", fontSize: 12 };

// ---------------------------------------------------------------- quadrants (labels come from the API)
const QUADRANTS: Record<Quadrant, { label: string; hint: string; className: string }> = {
  investigate: { label: "Investigate first", hint: "High GMV, weaker reviews", className: "border-warn/30 bg-warn/15 text-warn" },
  protect: { label: "Protect", hint: "High GMV, strong reviews", className: "border-brand/30 bg-brand/15 text-brand" },
  grow: { label: "Grow", hint: "Lower GMV, strong reviews", className: "border-sky-400/30 bg-sky-400/15 text-sky-300" },
  monitor: { label: "Monitor", hint: "Lower GMV, weaker reviews", className: "border-line bg-white/5 text-muted" },
};

function QuadrantBadge({ q }: { q: Quadrant }) {
  const meta = QUADRANTS[q];
  return (
    <span title={meta.hint} className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------- colour for late-delivery rate
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
const lateRamp = (t: number) => (t < 0.5 ? mix("#0EB582", "#FBBF24", t / 0.5) : mix("#FBBF24", "#FF6B4A", (t - 0.5) / 0.5));

// ---------------------------------------------------------------- tooltips
type TipProps<T> = { active?: boolean; payload?: readonly { payload?: T }[] };

function MatrixTooltip({ active, payload }: TipProps<CategoryPerf>) {
  const c = active ? payload?.[0]?.payload : undefined;
  if (!c) return null;
  return (
    <div className="min-w-48 rounded-xl border border-line bg-page/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{prettyCategory(c.category)}</p>
        <QuadrantBadge q={c.quadrant} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-muted">GMV</dt><dd className="text-right tabular-nums text-white">{brl(c.gmv, true)}</dd>
        <dt className="text-muted">Orders</dt><dd className="text-right tabular-nums text-white">{num(c.orders)}</dd>
        <dt className="text-muted">Avg review</dt><dd className="text-right tabular-nums text-white">{c.avg_review.toFixed(2)}</dd>
        <dt className="text-muted">Late rate</dt><dd className="text-right tabular-nums text-white">{pct(c.late_rate, 1)}</dd>
        <dt className="text-muted">Freight / GMV</dt><dd className="text-right tabular-nums text-white">{pct(c.freight_pct, 1)}</dd>
      </dl>
      <p className="mt-2 text-[10px] text-brand">Click to inspect</p>
    </div>
  );
}

function TrendTooltip({ active, payload }: TipProps<CategoryMonthRow>) {
  const r = active ? payload?.[0]?.payload : undefined;
  if (!r) return null;
  return (
    <div className="rounded-xl border border-line bg-page/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="text-muted">{r.month}</p>
      <p className="text-sm font-semibold text-white">{brl(r.gmv)}</p>
      <p className="text-muted">{num(r.orders)} orders</p>
    </div>
  );
}

// ---------------------------------------------------------------- opportunity matrix
function OpportunityMatrix({ cats, medianReview, medianGmv, selected, onSelect }: {
  cats: CategoryPerf[];
  medianReview: number | null;
  medianGmv: number | null;
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  const [minLate, maxLate] = useMemo(
    () => [Math.min(...cats.map((c) => c.late_rate)), Math.max(...cats.map((c) => c.late_rate))],
    [cats],
  );
  const t = (v: number) => (maxLate > minLate ? (v - minLate) / (maxLate - minLate) : 0);

  return (
    <div className="relative h-[480px]" role="img" aria-label="Scatter plot of product categories: average review against GMV">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 32, right: 24, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="#26304F" />
          <XAxis
            type="number"
            dataKey="avg_review"
            domain={["dataMin - 0.05", "dataMax + 0.05"]}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: "Average review score →", position: "insideBottom", offset: -20, fill: "#94A3B8", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="gmv"
            scale="log"
            domain={[(min: number) => min * 0.6, (max: number) => max * 2]}
            allowDataOverflow
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={brlAxis}
          />
          <ZAxis type="number" dataKey="orders" range={[60, 1400]} />
          {medianReview != null && <ReferenceLine x={medianReview} stroke="#94A3B8" strokeDasharray="4 4" />}
          {medianGmv != null && <ReferenceLine y={medianGmv} stroke="#94A3B8" strokeDasharray="4 4" />}
          <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={<MatrixTooltip />} />
          <Scatter
            data={cats}
            animationDuration={800}
            style={{ cursor: "pointer" }}
            onClick={(_entry: unknown, index: number) => onSelect(cats[index].category)}
          >
            {cats.map((c) => {
              const isSelected = c.category === selected;
              return (
                <Cell
                  key={c.category}
                  fill={lateRamp(t(c.late_rate))}
                  fillOpacity={selected && !isSelected ? 0.4 : 0.88}
                  stroke={isSelected ? "#FFFFFF" : "#11192C"}
                  strokeWidth={isSelected ? 2.5 : 1}
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* quadrant captions */}
      <span className="pointer-events-none absolute left-24 top-2 text-[11px] font-medium text-warn">
        ↖ High GMV · weaker reviews: investigate first
      </span>
      <span className="pointer-events-none absolute right-6 top-2 text-[11px] font-medium text-brand">
        Protect: high GMV · strong reviews ↗
      </span>
      <span className="pointer-events-none absolute bottom-1 left-24 text-[11px] text-muted">↙ Monitor</span>
      <span className="pointer-events-none absolute bottom-1 right-6 text-[11px] text-sky-300">Grow: loved but smaller ↘</span>
    </div>
  );
}

// ---------------------------------------------------------------- category detail (drill-down)
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-page/40 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CategoryDetail({ cat }: { cat: CategoryPerf }) {
  const { filters } = useFilters();
  // The result remembers which request it answers; while a newer request is in flight, trend is null.
  const [loaded, setLoaded] = useState<{ key: string; rows: CategoryMonthRow[] } | null>(null);
  const key = filters ? `${cat.category}|${filters.start}|${filters.end}|${filters.regions.join(",")}` : "";
  const trend = loaded && loaded.key === key ? loaded.rows : null;

  useEffect(() => {
    if (!filters) return;
    const ctrl = new AbortController();
    api.categoryMonthly(filters, cat.category, ctrl.signal)
      .then((rows) => setLoaded({ key, rows }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setLoaded({ key, rows: [] });
      });
    return () => ctrl.abort();
  }, [filters, cat.category, key]);

  return (
    <motion.div key={cat.category} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{prettyCategory(cat.category)}</h2>
        <QuadrantBadge q={cat.quadrant} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="GMV" value={brl(cat.gmv, true)} />
        <Stat label="Orders" value={num(cat.orders)} />
        <Stat label="Avg item price" value={brl(cat.avg_item_price)} />
        <Stat label="Avg review" value={`${cat.avg_review.toFixed(2)} / 5`} />
        <Stat label="Late rate" value={pct(cat.late_rate, 1)} />
        <Stat label="Freight / GMV" value={pct(cat.freight_pct, 1)} />
      </div>

      <p className="mb-2 mt-6 text-sm text-muted">Monthly GMV</p>
      <div className="h-56" role="img" aria-label={`Monthly GMV for ${prettyCategory(cat.category)}`}>
        {trend === null ? (
          <div className="h-full animate-pulse rounded-xl bg-active/40" />
        ) : trend.length === 0 ? (
          <p className="pt-16 text-center text-sm text-muted">No monthly data for this selection.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="categoryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EB582" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#0EB582" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#26304F" />
              <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={brlAxis} />
              <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={<TrendTooltip />} />
              <Area type="linear" dataKey="gmv" stroke="#0EB582" strokeWidth={2} fill="url(#categoryFill)" animationDuration={700} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- sortable, searchable table
type SortKey = "category" | "gmv" | "orders" | "avg_item_price" | "freight_pct" | "avg_review" | "late_rate";

const COLUMNS: { key: SortKey; label: string; format: (c: CategoryPerf) => string }[] = [
  { key: "category", label: "Category", format: (c) => prettyCategory(c.category) },
  { key: "gmv", label: "GMV", format: (c) => brl(c.gmv, true) },
  { key: "orders", label: "Orders", format: (c) => num(c.orders) },
  { key: "avg_item_price", label: "Avg item price", format: (c) => brl(c.avg_item_price) },
  { key: "freight_pct", label: "Freight / GMV", format: (c) => pct(c.freight_pct, 1) },
  { key: "avg_review", label: "Avg review", format: (c) => c.avg_review.toFixed(2) },
  { key: "late_rate", label: "Late rate", format: (c) => pct(c.late_rate, 1) },
];

function CategoryTable({ cats, selected, onSelect }: {
  cats: CategoryPerf[];
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("gmv");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cats
      .filter((c) => !q || prettyCategory(c.category).toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
        return dir === "asc" ? cmp : -cmp;
      });
  }, [cats, sortKey, dir, query]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "category" ? "asc" : "desc");
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">All categories</h2>
          <p className="mt-1 text-xs text-muted">Click a column to sort, a row to inspect it above.</p>
        </div>
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories"
            aria-label="Search categories"
            className="w-60 rounded-xl border border-line bg-page/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 z-10 bg-active/95 backdrop-blur">
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-4 py-3 font-medium ${col.key === "category" ? "text-left" : "text-right"}`}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(col.key)}
                      className={`inline-flex items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-brand ${
                        active ? "text-white" : "text-muted hover:text-white"
                      }`}
                    >
                      {col.label}
                      <Icon size={12} aria-hidden />
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-left font-medium text-muted">Quadrant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.category}
                tabIndex={0}
                onClick={() => onSelect(c.category)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c.category);
                  }
                }}
                aria-selected={c.category === selected}
                className={`cursor-pointer border-t border-line/60 transition-colors hover:bg-active/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                  c.category === selected ? "bg-active" : ""
                }`}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 tabular-nums ${col.key === "category" ? "text-left font-medium" : "text-right text-white/90"}`}
                  >
                    {col.format(c)}
                  </td>
                ))}
                <td className="px-4 py-2.5"><QuadrantBadge q={c.quadrant} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">No category matches “{query}”.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- page
export default function ProductsPage() {
  const { error: filtersError } = useFilters();
  const { data, loading, error, retry } = useFilteredData((f, s) => api.categoryPerformance(f, s));
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const cats = data?.categories ?? [];
  const current = cats.find((c) => c.category === selected) ?? cats[0] ?? null;
  const investigate = cats.filter((c) => c.quadrant === "investigate").sort((a, b) => b.gmv - a.gmv);
  const shownError = filtersError ?? error;

  function select(category: string) {
    setSelected(category);
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Products" subtitle="Which categories drive value, and which need attention" />

      {shownError ? (
        <ErrorCard message={shownError} onRetry={retry} />
      ) : !data ? (
        <div className="space-y-6">
          <Skeleton className="h-[140px]" />
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[360px]" />
        </div>
      ) : cats.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            No category has at least {data.min_orders} delivered orders for these filters. Try a wider date range or
            all states.
          </p>
        </Card>
      ) : (
        <div aria-busy={loading} className={`space-y-6 transition-opacity duration-300 ${loading ? "opacity-60" : ""}`}>
          {/* ------------------------------------------------ key finding */}
          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-warn">Where to look first</p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
              {investigate.length > 0
                ? `${investigate.length} high-GMV ${investigate.length === 1 ? "category has" : "categories have"} below-median reviews`
                : "No high-GMV category has below-median reviews"}
            </h2>
            {investigate.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {investigate.slice(0, 6).map((c) => (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => select(c.category)}
                    className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-1.5 text-left text-xs transition-colors hover:bg-warn/20 focus-visible:outline-2 focus-visible:outline-warn"
                  >
                    <span className="font-medium text-white">{prettyCategory(c.category)}</span>
                    <span className="ml-2 text-muted">
                      {brl(c.gmv, true)} · ★ {c.avg_review.toFixed(2)}
                    </span>
                  </button>
                ))}
                {investigate.length > 6 && (
                  <span className="self-center px-1 text-xs text-muted">
                    +{investigate.length - 6} more in the table below
                  </span>
                )}
              </div>
            )}
          </Card>

          {/* ------------------------------------------------ opportunity matrix */}
          <Card delay={0.1}>
            <h2 className="text-lg font-semibold">Opportunity matrix</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><MousePointerClick size={13} aria-hidden /> Click a bubble to inspect it</span>
              <span>Bubble size = orders</span>
              <span className="flex items-center gap-1.5">
                Colour = late rate
                <span className="h-1.5 w-16 rounded-full bg-gradient-to-r from-[#0EB582] via-[#FBBF24] to-[#FF6B4A]" />
              </span>
              <span>Dotted lines = medians</span>
            </p>
            <div className="mt-4">
              <OpportunityMatrix
                cats={cats}
                medianReview={data.median_review}
                medianGmv={data.median_gmv}
                selected={current?.category ?? null}
                onSelect={select}
              />
            </div>
          </Card>

          {/* ------------------------------------------------ drill-down */}
          <div ref={detailRef} className="scroll-mt-6">
            {current && (
              <Card delay={0.2}>
                <CategoryDetail cat={current} />
              </Card>
            )}
          </div>

          {/* ------------------------------------------------ table */}
          <Card delay={0.3}>
            <CategoryTable cats={cats} selected={current?.category ?? null} onSelect={select} />
          </Card>

          {/* ------------------------------------------------ method */}
          <div className="flex gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted backdrop-blur-xl">
            <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <p>
              <span className="font-medium text-white">A diagnostic tool, not a prediction.</span> Quadrants split
              categories at the median GMV and median review. Each order&apos;s review counts once per category, so
              orders with many items aren&apos;t over-weighted. Categories with fewer than {data.min_orders} delivered
              orders are hidden because their averages are unstable.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
