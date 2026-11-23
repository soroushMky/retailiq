"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard, Menu, Package, Sparkles, TrendingUp, Truck, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavItem = { href: string; label: string; icon: LucideIcon; ready: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, ready: true },
  { href: "/sales", label: "Sales", icon: TrendingUp, ready: true },
  { href: "/products", label: "Products", icon: Package, ready: true },
  { href: "/delivery", label: "Delivery & experience", icon: Truck, ready: true },
  { href: "/customers", label: "Customers", icon: Users, ready: true },
  { href: "/assistant", label: "AI assistant", icon: Sparkles, ready: true },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-ink-on-accent">R</span>
      <span className="text-lg font-semibold tracking-tight">RetailIQ</span>
    </div>
  );
}

/** The list of links. `pillId` must differ per instance, so the sliding pill doesn't jump between menus. */
function NavLinks({ pillId, onNavigate }: { pillId: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, ready }) => {
        if (!ready) {
          // Honest about what isn't built yet: visible, but not clickable
          return (
            <span
              key={href}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted/50"
            >
              <Icon size={18} aria-hidden />
              {label}
              <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider">
                Soon
              </span>
            </span>
          );
        }

        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-xl bg-active"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <Icon size={18} aria-hidden className={`relative ${active ? "text-brand" : ""}`} />
            <span className={`relative ${active ? "font-medium text-white" : ""}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const CREDIT = "Data: Olist public e-commerce dataset, Brazil 2016–2018";

/** Desktop (lg and up): fixed sidebar. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-sidebar/80 px-4 py-6 backdrop-blur-xl lg:flex">
      <div className="mb-8 px-3">
        <Logo />
        <p className="mt-2 text-xs leading-relaxed text-muted">Turn commerce data into confident decisions.</p>
      </div>
      <NavLinks pillId="nav-active-desktop" />
      <p className="mt-auto px-3 text-[11px] leading-relaxed text-muted/70">{CREDIT}</p>
    </aside>
  );
}

/** Mobile and tablet (below lg): top bar + slide-in drawer. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const current = NAV.find((n) => n.href === pathname)?.label ?? "";

  // While open: Escape closes, the page behind can't scroll, focus moves into the drawer and back out after.
  useEffect(() => {
    if (!open) return;
    const trigger = openButton.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-sidebar/85 px-5 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{current}</span>
          <button
            ref={openButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid size-10 place-items-center rounded-xl border border-line bg-card/70 text-white hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Menu size={20} aria-hidden />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="overlay"
              className="fixed inset-0 z-40 bg-page/70 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.aside
              key="drawer"
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-sidebar px-4 py-5 shadow-2xl lg:hidden"
              initial={{ x: reduce ? 0 : "-100%", opacity: reduce ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduce ? 0 : "-100%", opacity: reduce ? 0 : 1 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-6 flex items-center justify-between px-3">
                <Logo />
                <button
                  ref={closeButton}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="grid size-9 place-items-center rounded-xl text-muted hover:bg-active hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
              <NavLinks pillId="nav-active-mobile" onNavigate={() => setOpen(false)} />
              <p className="mt-auto px-3 text-[11px] leading-relaxed text-muted/70">{CREDIT}</p>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
