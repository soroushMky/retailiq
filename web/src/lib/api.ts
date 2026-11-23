// Types mirror the JSON returned by FastAPI. If the API changes, TypeScript flags every place that breaks.

export type Filters = { start: string; end: string; regions: string[] };

export type FilterOptions = {
  months: string[];
  regions: { code: string; name: string }[];
  default_start: string;
  default_end: string;
};

export type Kpis = {
  total_orders: number;
  delivered_orders: number;
  gmv: number | null;
  aov: number | null;
  units: number | null;
  customers: number;
  avg_review: number | null;
  late_rate: number | null;
};

export type TrendRow = { month: string; gmv: number | null; orders: number; aov: number | null };
export type CategoryRow = { category: string; gmv: number; orders: number; units: number };
export type RegionRow = { region: string; region_name: string; orders: number; gmv: number | null };
export type CityRow = { city: string; region: string; orders: number; gmv: number | null };

export type GeoPoint = { lat: number; lng: number; orders: number };
export type GeoData = {
  points: GeoPoint[];
  mapped_orders: number;
  total_orders: number;
  coverage_pct: number | null;
};

// ---- delivery & experience
export type DeliveryKpis = {
  late_rate: number | null;
  avg_delivery_days: number | null;
  review_on_time: number | null;
  review_late: number | null;
  review_gap: number | null;
  delivered_measured: number;
  late_orders: number;
};
export type StatusRow = { delivery: "Late" | "On time / early"; orders: number; avg_review: number; pct_negative: number };
export type DaysRow = { days_vs_promise: number; orders: number; avg_review: number };
export type LateRegionRow = {
  region: string;
  region_name: string;
  delivered_orders: number;
  late_rate: number;
  avg_delivery_days: number;
  avg_review: number | null;
};

// ---- products
export type Quadrant = "investigate" | "protect" | "grow" | "monitor";
export type CategoryPerf = {
  category: string;
  gmv: number;
  orders: number;
  units: number;
  avg_item_price: number;
  freight_pct: number;
  avg_review: number;
  late_rate: number;
  quadrant: Quadrant;
};
export type CategoryPerformance = {
  categories: CategoryPerf[];
  median_review: number | null;
  median_gmv: number | null;
  min_orders: number;
};
export type CategoryMonthRow = { month: string; gmv: number; orders: number };

// ---- sales
export type SalesMonth = {
  month: string;
  gmv: number | null;
  orders: number;
  aov: number | null;
  gmv_mom_pct: number | null; // null when either month is incomplete
  is_partial: boolean;
};
export type PeriodComparison =
  | { available: false; label: null }
  | {
      available: true;
      label: string;
      months: number;
      current_gmv: number;
      previous_gmv: number;
      gmv_growth_pct: number | null;
      current_orders: number;
      previous_orders: number;
      orders_growth_pct: number | null;
    };
export type TopProduct = { product: string; category: string; gmv: number; units: number; orders: number; avg_price: number };
export type PaymentRow = { method: string; payments: number; amount: number; share_pct: number };

// ---- customers
export type CustomerKpis = { customers: number; repeat_customers: number; repeat_rate: number | null; avg_orders: number | null };
export type SegmentRow = { segment: "Repeat" | "One-time"; customers: number; avg_spend_per_customer: number; aov: number | null };
export type FrequencyRow = { orders_per_customer: string; customers: number };
export type HeatCell = { weekday: number; hour: number; orders: number };
export type Cohorts = {
  rows: { cohort: string; size: number; cells: (number | null)[] }[];
  max_k: number;
  data_end: string;
};

// ---- AI assistant
export type AgentMode = "llm" | "demo";
export type AgentStep = {
  tool: string;
  filters?: { start: string; end: string; regions: string[] };
  result?: unknown;
  error?: string;
};
export type AgentAnswer = {
  mode: AgentMode;
  model: string | null;
  answer: string;
  steps: AgentStep[];
  usage: { input_tokens: number; output_tokens: number } | null;
  notice?: string;
};
export type AgentStatus = { mode: AgentMode; model: string | null; suggested_questions: string[] };
export type ChatTurn = { role: "user" | "assistant"; content: string };

function query(f: Filters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ start: f.start, end: f.end });
  f.regions.forEach((r) => p.append("region", r));
  Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
  return p.toString();
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  filters: (s?: AbortSignal) => getJSON<FilterOptions>("/api/filters", s),
  kpis: (f: Filters, s?: AbortSignal) => getJSON<Kpis>(`/api/kpis?${query(f)}`, s),
  trend: (f: Filters, s?: AbortSignal) => getJSON<TrendRow[]>(`/api/monthly-trend?${query(f)}`, s),
  topCategories: (f: Filters, s?: AbortSignal) =>
    getJSON<CategoryRow[]>(`/api/top-categories?${query(f, { limit: 10 })}`, s),
  ordersByRegion: (f: Filters, s?: AbortSignal) =>
    getJSON<RegionRow[]>(`/api/orders-by-region?${query(f)}`, s),
  ordersByCity: (f: Filters, s?: AbortSignal) =>
    getJSON<CityRow[]>(`/api/orders-by-city?${query(f, { limit: 10 })}`, s),
  geo: (f: Filters, s?: AbortSignal, cell = 0.1) => getJSON<GeoData>(`/api/geo?${query(f, { cell })}`, s),

  // delivery & experience
  deliveryKpis: (f: Filters, s?: AbortSignal) => getJSON<DeliveryKpis>(`/api/delivery/kpis?${query(f)}`, s),
  reviewByStatus: (f: Filters, s?: AbortSignal) =>
    getJSON<StatusRow[]>(`/api/delivery/review-by-status?${query(f)}`, s),
  reviewByDays: (f: Filters, s?: AbortSignal) => getJSON<DaysRow[]>(`/api/delivery/review-by-days?${query(f)}`, s),
  lateByRegion: (f: Filters, s?: AbortSignal) =>
    getJSON<LateRegionRow[]>(`/api/delivery/late-by-region?${query(f)}`, s),

  // products
  categoryPerformance: (f: Filters, s?: AbortSignal) =>
    getJSON<CategoryPerformance>(`/api/products/categories?${query(f)}`, s),
  categoryMonthly: (f: Filters, category: string, s?: AbortSignal) =>
    getJSON<CategoryMonthRow[]>(`/api/products/category-monthly?${query(f, { category })}`, s),

  // sales
  salesMonthly: (f: Filters, s?: AbortSignal) => getJSON<SalesMonth[]>(`/api/sales/monthly?${query(f)}`, s),
  periodComparison: (f: Filters, s?: AbortSignal) =>
    getJSON<PeriodComparison>(`/api/sales/comparison?${query(f)}`, s),
  topProducts: (f: Filters, s?: AbortSignal) =>
    getJSON<TopProduct[]>(`/api/sales/top-products?${query(f, { limit: 20 })}`, s),
  paymentMix: (f: Filters, s?: AbortSignal) => getJSON<PaymentRow[]>(`/api/sales/payment-mix?${query(f)}`, s),

  // customers
  customerKpis: (f: Filters, s?: AbortSignal) => getJSON<CustomerKpis>(`/api/customers/kpis?${query(f)}`, s),
  segments: (f: Filters, s?: AbortSignal) => getJSON<SegmentRow[]>(`/api/customers/segments?${query(f)}`, s),
  frequency: (f: Filters, s?: AbortSignal) => getJSON<FrequencyRow[]>(`/api/customers/frequency?${query(f)}`, s),
  heatmap: (f: Filters, s?: AbortSignal) => getJSON<HeatCell[]>(`/api/customers/heatmap?${query(f)}`, s),
  cohorts: (f: Filters, s?: AbortSignal) => getJSON<Cohorts>(`/api/customers/cohorts?${query(f)}`, s),

  // AI assistant
  agentStatus: (s?: AbortSignal) => getJSON<AgentStatus>("/api/agent/status", s),
  ask: (question: string, f: Filters, history: ChatTurn[], s?: AbortSignal) =>
    postJSON<AgentAnswer>("/api/agent/ask", { question, start: f.start, end: f.end, regions: f.regions, history }, s),
};
