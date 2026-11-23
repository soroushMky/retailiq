// All number formatting in one place, so every screen shows numbers the same way.

export function brl(x: number | null | undefined, short = false): string {
  if (x == null) return "–";
  if (short && Math.abs(x) >= 1_000_000) return `R$ ${(x / 1_000_000).toFixed(2)}M`;
  if (short && Math.abs(x) >= 1_000) return `R$ ${(x / 1_000).toFixed(1)}K`;
  return `R$ ${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function num(x: number | null | undefined): string {
  return x == null ? "–" : Math.round(x).toLocaleString("en-US");
}

export function pct(x: number | null | undefined, digits = 2): string {
  return x == null ? "–" : `${x.toFixed(digits)}%`;
}

export function score(x: number | null | undefined): string {
  return x == null ? "–" : `${x.toFixed(2)} / 5`;
}

export function prettyCategory(c: string): string {
  const s = c.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Compact label for chart axes: R$ 750K, R$ 1.2M */
/** Compact label for chart axes. Keeps one decimal below 10K so small ranges stay distinct. */
export function brlAxis(x: number): string {
  const a = Math.abs(x);
  if (a >= 1_000_000) return `R$ ${(x / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `R$ ${Math.round(x / 1_000)}K`;
  if (a >= 1_000) return `R$ ${(x / 1_000).toFixed(1)}K`;
  return `R$ ${Math.round(x)}`;
}

/** "sao jose dos campos" -> "Sao Jose dos Campos" (Portuguese connectors stay lowercase) */
export function prettyCity(c: string): string {
  const small = new Set(["de", "do", "da", "dos", "das", "e"]);
  return c
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}