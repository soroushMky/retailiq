"use client";

import { motion, useReducedMotion } from "framer-motion";

type CardProps = { children: React.ReactNode; className?: string; delay?: number };

/** A frosted-glass panel that rises into view once, with a small delay so panels appear one after another. */
export function Card({ children, className = "", delay = 0 }: CardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-line bg-card/75 p-5 backdrop-blur-xl lg:p-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** Grey pulsing placeholder shown while data loads, so the layout doesn't jump. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-2xl border border-line bg-card/75 ${className}`} />;
}