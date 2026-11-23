"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Bot, ChevronDown, Database, FlaskConical, Info, RotateCcw, Sparkles, User } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, Skeleton } from "@/components/Card";
import { PageHeader } from "@/components/PageParts";
import { api, type AgentAnswer, type AgentStatus, type AgentStep, type ChatTurn } from "@/lib/api";
import { useFilters } from "@/lib/filters";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: AgentAnswer }
  | { id: number; role: "error"; text: string; question: string };

const TOOL_LABELS: Record<string, string> = {
  get_kpis: "Headline KPIs",
  get_sales_trend: "Monthly sales trend",
  compare_periods: "Year-on-year comparison",
  get_top_categories: "Top categories",
  get_category_performance: "Category performance",
  get_delivery_kpis: "Delivery KPIs",
  get_late_rate_by_state: "Late rate by state",
  get_review_by_delivery_days: "Review vs delivery days",
  get_orders_by_state: "Orders by state",
  get_customer_metrics: "Customer metrics",
  get_cohort_retention: "Cohort retention",
  get_payment_mix: "Payment mix",
  get_purchase_timing: "Purchase timing",
};

// ---------------------------------------------------------------- tiny, safe markdown: "- " bullets and **bold**
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="list-disc space-y-1 pl-5 marker:text-brand">
          {bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) bullets.push(line.replace(/^[-*•]\s+/, ""));
    else {
      flush();
      if (line) blocks.push(<p key={`p${blocks.length}`}><Inline text={line} /></p>);
    }
  });
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-slate-200">{blocks}</div>;
}

// ---------------------------------------------------------------- "show your work"
function StepView({ step, index }: { step: AgentStep; index: number }) {
  const f = step.filters;
  return (
    <li className="rounded-xl border border-line bg-page/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="grid size-5 place-items-center rounded-full bg-active font-semibold text-brand">{index + 1}</span>
        <span className="font-medium text-white">{TOOL_LABELS[step.tool] ?? step.tool}</span>
        <code className="text-muted/70">{step.tool}</code>
        {f && (
          <span className="text-muted">
            · {f.start} → {f.end} · {f.regions.length ? f.regions.join(", ") : "all states"}
          </span>
        )}
      </div>
      {step.error ? (
        <p className="mt-2 font-mono text-xs text-danger">{step.error}</p>
      ) : (
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-page p-2 font-mono text-[11px] leading-snug text-muted">
          {JSON.stringify(step.result, null, 2)}
        </pre>
      )}
    </li>
  );
}

function ModeChip({ answer }: { answer: AgentAnswer }) {
  return answer.mode === "llm" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] text-brand">
      <Sparkles size={11} aria-hidden /> {answer.model}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
      <FlaskConical size={11} aria-hidden /> Demo · rule-based, no LLM
    </span>
  );
}

function AssistantMessage({ answer }: { answer: AgentAnswer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
        <Bot size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-card/75 p-4 backdrop-blur-xl">
        {answer.notice && (
          <p className="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">{answer.notice}</p>
        )}
        <RichText text={answer.answer} />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-muted">
          <ModeChip answer={answer} />
          {answer.steps.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-md px-1 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Database size={12} aria-hidden />
              How I got this ({answer.steps.length} {answer.steps.length === 1 ? "query" : "queries"})
              <ChevronDown size={12} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {answer.usage && (
            <span className="ml-auto tabular-nums text-muted/70">
              {answer.usage.input_tokens.toLocaleString()} in · {answer.usage.output_tokens.toLocaleString()} out tokens
            </span>
          )}
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ol
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 space-y-2 overflow-hidden"
            >
              {answer.steps.map((s, i) => <StepView key={i} step={s} index={i} />)}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Thinking() {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <div className="grid size-8 place-items-center rounded-full bg-brand/15 text-brand">
        <Bot size={16} aria-hidden />
      </div>
      <span>Querying the data</span>
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-brand"
            animate={reduce ? undefined : { opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function AssistantPage() {
  const { filters, options } = useFilters();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    api.agentStatus(c.signal).then(setStatus).catch((e: Error) => {
      if (e.name !== "AbortError") setStatusError(e.message);
    });
    return () => {
      c.abort();
      ctrl.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  /** Previous question/answer pairs, so follow-ups like "and in SP?" make sense to the model. */
  function history(): ChatTurn[] {
    const turns: ChatTurn[] = [];
    for (const m of messages) {
      if (m.role === "user") turns.push({ role: "user", content: m.text });
      else if (m.role === "assistant") turns.push({ role: "assistant", content: m.answer.answer });
    }
    return turns.slice(-6);
  }

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || busy || !filters) return;
    const past = history();
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: question }]);
    setBusy(true);
    ctrl.current = new AbortController();
    try {
      const answer = await api.ask(question, filters, past, ctrl.current.signal);
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", answer }]);
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError")
        setMessages((m) => [...m, { id: nextId.current++, role: "error", text: err.message, question }]);
    } finally {
      setBusy(false);
    }
  }

  const regionLabel =
    filters && filters.regions.length
      ? filters.regions.map((c) => options?.regions.find((r) => r.code === c)?.name ?? c).join(", ")
      : "All states";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="AI assistant" subtitle="Ask in plain English. Every number comes from the dashboard's own SQL." />

      {/* mode banner: never let a demo look like a real model */}
      {statusError ? (
        <Card className="mb-6 border-danger/40 text-sm text-danger">Couldn&apos;t reach the API: {statusError}</Card>
      ) : !status ? (
        <Skeleton className="mb-6 h-20" />
      ) : status.mode === "llm" ? (
        <Card className="mb-6 flex items-start gap-3 text-sm">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="text-muted">
            <span className="font-semibold text-white">Live mode · {status.model}.</span> The model can only call 13
            read-only analytics tools (no free SQL). Open &ldquo;How I got this&rdquo; under any answer to see each query
            and its raw result.
          </p>
        </Card>
      ) : (
        <Card className="mb-6 flex items-start gap-3 border-warn/40 text-sm">
          <FlaskConical size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p className="text-muted">
            <span className="font-semibold text-warn">Demo mode: no language model is running.</span> Questions are
            matched to topics by keywords and answered from a fixed template, using real query results. Add an{" "}
            <code className="text-white">ANTHROPIC_API_KEY</code> to the API&apos;s <code className="text-white">.env</code>{" "}
            file to switch to live mode.
          </p>
        </Card>
      )}

      <Card className="flex min-h-[28rem] flex-col">
        <div className="flex-1 space-y-5" aria-live="polite">
          {messages.length === 0 && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand/15 text-brand">
                <Bot size={22} aria-hidden />
              </div>
              <h2 className="text-lg font-semibold">What would you like to know?</h2>
              <p className="mt-1 text-sm text-muted">Try one of these, or type your own.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {(status?.suggested_questions ?? []).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={busy || !filters}
                    className="rounded-full border border-line bg-page/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-brand/60 hover:text-white disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {m.role === "user" ? (
                  <div className="flex justify-end gap-3">
                    <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm text-ink-on-accent">
                      {m.text}
                    </p>
                    <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-active text-muted">
                      <User size={16} aria-hidden />
                    </div>
                  </div>
                ) : m.role === "assistant" ? (
                  <AssistantMessage answer={m.answer} />
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
                    <span className="flex-1 text-danger">Something went wrong: {m.text}</span>
                    <button
                      type="button"
                      onClick={() => send(m.question)}
                      className="inline-flex items-center gap-1 rounded-lg bg-active px-3 py-1.5 text-xs text-white hover:bg-line"
                    >
                      <RotateCcw size={12} aria-hidden /> Retry
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {busy && <Thinking />}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-6 border-t border-line pt-4"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-page/70 p-2 focus-within:border-brand/60">
            <label htmlFor="question" className="sr-only">Your question</label>
            <textarea
              id="question"
              rows={1}
              maxLength={500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="e.g. Which states have the worst late-delivery rate?"
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-muted/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy || !filters}
              aria-label="Send question"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-ink-on-accent transition hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Info size={12} aria-hidden />
              Using filters: {filters ? `${filters.start} → ${filters.end} · ${regionLabel}` : "loading…"}. A question can
              name its own period or state.
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  ctrl.current?.abort();
                  setMessages([]);
                  setBusy(false);
                }}
                className="hover:text-white"
              >
                Clear conversation
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card className="mt-6 flex items-start gap-3 text-sm">
        <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <p className="text-muted">
          <span className="font-semibold text-white">How this stays honest.</span> The assistant cannot run its own SQL.
          It picks from validated, read-only functions (the same ones behind every chart), and every result is shown
          above. Relationships it reports are correlations, not proof of cause.
        </p>
      </Card>
    </div>
  );
}
