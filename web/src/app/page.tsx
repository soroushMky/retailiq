"use client";

import {
  Boxes, Clock, DollarSign, MousePointerClick, PackageCheck, Receipt, ShoppingCart, Star, Users,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Card, Skeleton } from "@/components/Card";
import { HBarChart, TrendChart } from "@/components/charts";
import { KpiCard } from "@/components/KpiCard";
import { ErrorCard, PageHeader } from "@/components/PageParts";
import { api, type Kpis } from "@/lib/api";
import { useFilteredData, useFilters } from "@/lib/filters";
import { brl, num, pct, prettyCategory, prettyCity, score } from "@/lib/format";

// Three.js needs the browser (WebGL), so the globe is never rendered on the server
const Globe = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-active/40" />,
});

type KpiDef = {
  key: keyof Kpis;
  label: string;
  icon: LucideIcon;
  format: (v: number) => string;
  help: string;
  highlight?: boolean;
};

const KPI_DEFS: KpiDef[] = [
  { key: "gmv", label: "Delivered GMV", icon: DollarSign, format: (v) => brl(v, true), highlight: true,
    help: "Sum of item prices on delivered orders, excluding freight. Not revenue or profit." },
  { key: "total_orders", label: "Total orders", icon: ShoppingCart, format: num,
    help: "All orders placed in the period, any status." },
  { key: "delivered_orders", label: "Delivered orders", icon: PackageCheck, format: num,
    help: "Orders with status 'delivered'." },
  { key: "aov", label: "Avg order value", icon: Receipt, format: (v) => brl(v),
    help: "Delivered GMV ÷ delivered orders that contain items." },
  { key: "units", label: "Units sold", icon: Boxes, format: num,
    help: "Item rows on delivered orders (one row = one unit)." },
  { key: "customers", label: "Customers", icon: Users, format: num,
    help: "Distinct people (customer_unique_id), not per-order customer IDs." },
  { key: "avg_review", label: "Avg review", icon: Star, format: score,
    help: "Mean review score per order; several reviews on one order are averaged first." },
  { key: "late_rate", label: "Late rate", icon: Clock, format: (v) => pct(v),
    help: "Delivered orders that arrived after the estimated date ÷ delivered orders with a delivery date." },
];

export default function OverviewPage() {
  const { options, filters, setFilters, error: filtersError } = useFilters();

  const { data, loading, error, retry } = useFilteredData((f, s) =>
    Promise.all([
      api.kpis(f, s),
      api.trend(f, s),
      api.topCategories(f, s),
      api.ordersByRegion(f, s),
      api.ordersByCity(f, s),
      // Level of detail: ~50 km cells for the whole country, ~10 km cells inside one state.
      // A map failure must not break the rest of the dashboard.
      api.geo(f, s, f.regions.length === 1 ? 0.1 : 0.5).catch(() => null),
    ]).then(([kpis, trend, cats, regions, cities, geo]) => ({ kpis, trend, cats, regions, cities, geo })),
  );

  const shownError = filtersError ?? error;
  const refreshing = loading && data !== null;

  // Drill-down: with exactly one state selected, the geography chart switches from states to its cities
  const singleState = filters?.regions.length === 1 ? filters.regions[0] : null;
  const singleStateName = options?.regions.find((r) => r.code === singleState)?.name ?? singleState;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Overview" subtitle="Olist marketplace · Brazilian e-commerce, 2016–2018" />

      {shownError ? (
        <ErrorCard message={shownError} onRetry={retry} />
      ) : (
        <div aria-busy={loading}>
          {/* ------------------------------------------------ hero: 3D globe */}
          <Card className="mb-6 overflow-hidden !p-0">
            <div className="grid lg:grid-cols-[1fr_1.4fr]">
              <div className="flex flex-col justify-center gap-5 p-6 lg:p-8">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand">Where orders come from</p>
                <h2 className="text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">
                  {!data
                    ? "Loading the map…"
                    : data.geo
                      ? `${num(data.geo.mapped_orders)} orders across ${singleStateName ?? "Brazil"}`
                      : "Map unavailable"}
                </h2>
                <p className="text-sm leading-relaxed text-muted">
                  Each state is coloured by its number of orders (ranked from fewest to most: green → gold → coral);
                  busier states rise higher. Rings pulse on the six busiest areas. Hover a state for its count, click
                  it to filter the dashboard. Drag to rotate, scroll to zoom.
                </p>
                {data?.geo && (
                  <dl className="grid grid-cols-2 gap-4 border-t border-line pt-5">
                    <div>
                      <dt className="text-xs text-muted">Areas with orders</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums">{num(data.geo.points.length)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Orders placed on the map</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums">{pct(data.geo.coverage_pct, 1)}</dd>
                    </div>
                  </dl>
                )}
              </div>
              <div
                className="relative h-[360px] cursor-grab active:cursor-grabbing lg:h-[460px]"
                role="img"
                aria-label="Interactive 3D globe showing Olist orders by Brazilian state"
              >
                {data?.geo && filters && (
                  <Globe
                    points={data.geo.points}
                    states={data.regions}
                    selected={singleState}
                    onStateClick={(code) => setFilters({ ...filters, regions: [code] })}
                  />
                )}
              </div>
            </div>
          </Card>

          <div className={`transition-opacity duration-300 ${refreshing ? "opacity-60" : ""}`}>
            {/* ------------------------------------------------ KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {KPI_DEFS.map((d, i) =>
                data ? (
                  <KpiCard
                    key={d.key}
                    index={i}
                    label={d.label}
                    icon={d.icon}
                    help={d.help}
                    highlight={d.highlight}
                    value={data.kpis[d.key]}
                    format={d.format}
                  />
                ) : (
                  <Skeleton key={d.key} className="h-[132px]" />
                ),
              )}
            </div>

            {/* ------------------------------------------------ monthly trend */}
            <div className="mt-6">
              {data ? (
                <Card delay={0.35}>
                  {data.trend.length ? (
                    <TrendChart data={data.trend} />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted">No orders match these filters.</p>
                  )}
                </Card>
              ) : (
                <Skeleton className="h-[400px]" />
              )}
            </div>

            {/* ------------------------------------------------ categories + geography (drill-down) */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {data && filters ? (
                <>
                  <Card delay={0.45}>
                    <h2 className="mb-4 text-lg font-semibold">Top 10 categories by GMV</h2>
                    <HBarChart
                      data={data.cats}
                      labelKey="category"
                      valueKey="gmv"
                      color="#0EB582"
                      format={(v) => brl(v)}
                      labelFormat={prettyCategory}
                      ariaLabel="Top 10 product categories by delivered GMV"
                    />
                  </Card>

                  <Card delay={0.55}>
                    {singleState ? (
                      <>
                        <h2 className="mb-1 text-lg font-semibold">Top cities in {singleStateName}</h2>
                        <p className="mb-4 text-xs text-muted">Drill-down: the state filter is active.</p>
                        <HBarChart
                          data={data.cities}
                          labelKey="city"
                          valueKey="orders"
                          color="#374A86"
                          format={num}
                          labelFormat={prettyCity}
                          ariaLabel={`Top cities in ${singleStateName} by number of orders`}
                        />
                      </>
                    ) : (
                      <>
                        <h2 className="mb-1 text-lg font-semibold">Orders by customer state</h2>
                        <p className="mb-4 flex items-center gap-1.5 text-xs text-muted">
                          <MousePointerClick size={13} aria-hidden /> Click a state to drill down into its cities.
                        </p>
                        <HBarChart
                          data={data.regions.slice(0, 10)}
                          labelKey="region_name"
                          valueKey="orders"
                          color="#374A86"
                          format={num}
                          ariaLabel="Top 10 Brazilian states by number of orders"
                          onBarClick={(row) => setFilters({ ...filters, regions: [row.region] })}
                        />
                      </>
                    )}
                  </Card>
                </>
              ) : (
                <>
                  <Skeleton className="h-[420px]" />
                  <Skeleton className="h-[420px]" />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
