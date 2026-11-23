"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import { FilterBar } from "@/components/FilterBar";
import { useFilters } from "@/lib/filters";

/** Page title + the shared filter bar. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { options, filters, setFilters } = useFilters();
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
      <div>
        <motion.h1
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl font-semibold tracking-tight lg:text-4xl"
        >
          {title}
        </motion.h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
      </div>
      {options && filters && <FilterBar options={options} value={filters} onChange={setFilters} />}
    </header>
  );
}

/** Friendly error panel with a retry button. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 border-danger/40">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle size={18} aria-hidden />
        <h2 className="font-semibold">Couldn&apos;t load the data</h2>
      </div>
      <p className="text-sm text-muted">
        Is the API running? Start it with <code className="text-white">uvicorn api.main:app --port 8000</code>.
      </p>
      <p className="font-mono text-xs text-muted/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-ink-on-accent hover:opacity-90"
      >
        Try again
      </button>
    </Card>
  );
}
