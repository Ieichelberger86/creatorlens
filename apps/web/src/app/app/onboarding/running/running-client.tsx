"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = {
  step: string;
  label: string;
  ts: number;
  data?: Record<string, unknown>;
};

const PHASES: Array<{ match: string; phase: string; emoji: string; weight: number }> = [
  { match: "scrape", phase: "Pulling your videos", emoji: "📥", weight: 25 },
  { match: "voice", phase: "Distilling your voice", emoji: "🎙️", weight: 15 },
  { match: "audit", phase: "Writing your audit", emoji: "📝", weight: 30 },
  { match: "goals", phase: "Setting 90-day goals", emoji: "🎯", weight: 30 },
];

export function RunningClient() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<string>("Starting up");
  const [pct, setPct] = useState<number>(2);
  const [err, setErr] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const fired = useRef<boolean>(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    let cancelled = false;
    let pctRunner: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        // Slow auto-progress while we wait for real events (caps at 90%)
        pctRunner = setInterval(() => {
          if (cancelled) return;
          setPct((p) => Math.min(90, p + 1));
        }, 1500);

        const res = await fetch("/api/onboarding/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          // eslint-disable-next-line no-cond-assign
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const event = JSON.parse(line) as
                | { type: "step"; step: string; label: string; data?: Record<string, unknown> }
                | { type: "done"; conversation_id: string | null }
                | { type: "error"; message: string };

              if (event.type === "step") {
                if (cancelled) continue;
                setSteps((prev) => [
                  ...prev,
                  {
                    step: event.step,
                    label: event.label,
                    ts: Date.now(),
                    data: event.data,
                  },
                ]);

                // Update phase + nudge progress forward
                const matched = PHASES.find((p) => event.step.startsWith(p.match));
                if (matched) {
                  setPhase(matched.phase);
                  // Bump pct to roughly where this phase lands
                  const idx = PHASES.indexOf(matched);
                  const cumWeight =
                    PHASES.slice(0, idx + 1).reduce((s, p) => s + p.weight, 0);
                  setPct((p) => Math.max(p, Math.min(90, cumWeight - 5)));
                }
              } else if (event.type === "done") {
                if (cancelled) continue;
                setPct(100);
                setPhase("Done");
                if (pctRunner) clearInterval(pctRunner);
                // Brief pause so the user sees "Done" land before redirect
                setTimeout(() => {
                  if (cancelled) return;
                  if (event.conversation_id) {
                    router.push(`/app/c/${event.conversation_id}`);
                  } else {
                    router.push("/app");
                  }
                }, 600);
              } else if (event.type === "error") {
                if (cancelled) continue;
                setErr(event.message);
                if (pctRunner) clearInterval(pctRunner);
              }
            } catch {
              // ignore partial lines
            }
          }
        }
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (pctRunner) clearInterval(pctRunner);
      }
    })();

    return () => {
      cancelled = true;
      if (pctRunner) clearInterval(pctRunner);
    };
  }, [router]);

  const elapsedSec = Math.floor((Date.now() - startedAt.current) / 1000);

  return (
    <main className="relative mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-xl flex-1 flex-col px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] hero-glow"
      />
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="mb-2 inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
          Building your account
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">
          {phase}…
        </h1>
        <p className="mb-6 text-sm text-fg-muted">
          Lens is pulling your videos, learning your voice, writing a structured
          audit, and breaking your 90-day vision into goals with action plans.
          Hang tight — usually 60–90 seconds.
        </p>

        {/* Big progress bar */}
        <div className="mb-2 flex items-center justify-between text-[11px] text-fg-subtle">
          <span className="font-mono">{pct.toFixed(0)}%</span>
          <span className="font-mono">{elapsedSec}s</span>
        </div>
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Live event log */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated/40 p-4">
          {steps.length === 0 ? (
            <div className="text-xs text-fg-subtle">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Warming up…
            </div>
          ) : (
            steps.map((s, i) => {
              const isWarn = s.step.endsWith("_warn");
              const isLast = i === steps.length - 1;
              const isPast = i < steps.length - 1;
              return (
                <div
                  key={i}
                  className={
                    "flex items-start gap-3 text-sm " +
                    (isWarn ? "text-warning" : isPast ? "text-fg-muted" : "text-fg")
                  }
                >
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono">
                    {isPast ? "✓" : isLast ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> : "·"}
                  </span>
                  <span className="flex-1">{s.label}</span>
                </div>
              );
            })
          )}
        </div>

        {err ? (
          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <div className="mb-1 font-medium">Something went wrong</div>
            <div className="text-xs">{err}</div>
            <button
              type="button"
              onClick={() => location.reload()}
              className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs hover:bg-danger/20"
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="mt-auto pt-8 text-center text-[11px] text-fg-subtle">
          You can stay on this page — we&apos;ll route you to chat the moment
          your audit is ready.
        </div>
      </div>
    </main>
  );
}
