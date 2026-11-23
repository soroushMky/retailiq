"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Info, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

type KpiCardProps = {
  label: string;
  value: number | null;
  format: (v: number) => string;
  help: string;
  icon: LucideIcon;
  index: number;
  highlight?: boolean;
};

export function KpiCard({ label, value, format, help, icon: Icon, index, highlight = false }: KpiCardProps) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const [animated, setAnimated] = useState("–");

  // What to show is derived during render; state only holds the in-between numbers of the count-up.
  const text = value == null ? "–" : reduce ? format(value) : animated;

  // Count up from the previous value to the new one whenever the value changes.
  useEffect(() => {
    if (value == null) return;
    if (reduce) {
      motionValue.jump(value); // so a later animation starts from the right number
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setAnimated(format(v)), // setState inside a callback is fine
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduce ? undefined : { y: -4 }}
      className={`rounded-2xl border p-5 transition-colors duration-300 ${
        highlight
          ? "border-brand bg-brand text-ink-on-accent shadow-[0_12px_40px_-12px] shadow-brand/50"
          : "border-line bg-card/75 backdrop-blur-xl hover:border-brand/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl ${
              highlight ? "bg-ink-on-accent/10" : "bg-active text-brand"
            }`}
          >
            <Icon size={18} aria-hidden />
          </span>
          <h3 className={`text-sm ${highlight ? "text-ink-on-accent/75" : "text-muted"}`}>{label}</h3>
        </div>

        {/* Accessible definition: shows on hover AND keyboard focus */}
        <span className="group/tip relative">
          <button
            type="button"
            aria-label={`What is ${label}?`}
            className={`rounded-md p-1 focus-visible:outline-2 focus-visible:outline-brand ${
              highlight ? "text-ink-on-accent/60" : "text-muted hover:text-white"
            }`}
          >
            <Info size={14} aria-hidden />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-7 z-20 w-60 rounded-xl border border-line bg-page p-3 text-xs leading-relaxed text-white opacity-0 shadow-2xl transition-opacity group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
          >
            {help}
          </span>
        </span>
      </div>

      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{text}</p>
    </motion.article>
  );
}
