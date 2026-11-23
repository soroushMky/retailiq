"use client";

import { RotateCcw } from "lucide-react";
import type { FilterOptions, Filters } from "@/lib/api";

type FilterBarProps = { options: FilterOptions; value: Filters; onChange: (f: Filters) => void };

const SELECT =
  "rounded-xl border border-line bg-card px-3 py-2 text-sm text-white transition-colors hover:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand";

export function FilterBar({ options, value, onChange }: FilterBarProps) {
  const isDefault =
    value.start === options.default_start && value.end === options.default_end && value.regions.length === 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-xs text-muted">
        From
        <select
          className={SELECT}
          value={value.start}
          onChange={(e) => {
            const start = e.target.value;
            onChange({ ...value, start, end: start > value.end ? start : value.end });
          }}
        >
          {options.months.map((m) => (
            <option key={m} value={m} className="bg-card">{m}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-muted">
        To
        <select className={SELECT} value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })}>
          {options.months
            .filter((m) => m >= value.start)
            .map((m) => (
              <option key={m} value={m} className="bg-card">{m}</option>
            ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-muted">
        Customer state
        <select
          className={SELECT}
          value={value.regions[0] ?? ""}
          onChange={(e) => onChange({ ...value, regions: e.target.value ? [e.target.value] : [] })}
        >
          <option value="" className="bg-card">All states</option>
          {options.regions.map((r) => (
            <option key={r.code} value={r.code} className="bg-card">{r.name}</option>
          ))}
        </select>
      </label>

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange({ start: options.default_start, end: options.default_end, regions: [] })}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-brand transition-colors hover:bg-active focus-visible:outline-2 focus-visible:outline-brand"
        >
          <RotateCcw size={14} aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}