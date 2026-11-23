"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { api, type FilterOptions, type Filters } from "@/lib/api";

type FiltersContextValue = {
  options: FilterOptions | null;
  filters: Filters | null;
  setFilters: Dispatch<SetStateAction<Filters | null>>;
  error: string | null;
};

const FiltersContext = createContext<FiltersContextValue | null>(null);

/** Loads the filter options once and shares the current filters with every page. */
export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api.filters(ctrl.signal)
      .then((o) => {
        setOptions(o);
        setFilters({ start: o.default_start, end: o.default_end, regions: [] });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <FiltersContext.Provider value={{ options, filters, setFilters, error }}>{children}</FiltersContext.Provider>
  );
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside <FiltersProvider>");
  return ctx;
}

/** Re-runs `load` whenever the filters change; cancels stale requests; exposes loading / error / retry. */
export function useFilteredData<T>(load: (f: Filters, signal: AbortSignal) => Promise<T>) {
  const { filters } = useFilters();
  const [attempt, setAttempt] = useState(0);
  // Each result remembers which request produced it. "loading" is derived, not stored:
  // it is true while the newest request has no result yet (old data stays on screen meanwhile).
  const request = useMemo(() => (filters ? { filters, attempt } : null), [filters, attempt]);
  const [result, setResult] = useState<{ request: unknown; data: T | null; error: string | null }>({
    request: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!request) return;
    const ctrl = new AbortController();
    load(request.filters, ctrl.signal)
      .then((data) => setResult({ request, data, error: null }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setResult((prev) => ({ request, data: prev.data, error: e.message }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const loading = request === null || result.request !== request;
  return {
    data: result.data,
    loading,
    error: loading ? null : result.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
