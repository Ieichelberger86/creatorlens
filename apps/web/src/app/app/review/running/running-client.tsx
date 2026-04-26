"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { step: string; label: string; ts: number };

const PHASES: Array<{ match: string; phase: string; weight: number }> = [
  { match: "scrape", phase: "Pulling last week's posts", weight: 35 },
  { match: "analyze", phase: "Analyzing performance", weight: 20 },
  { match: "write", phase: "Writing your review + plan", weight: 45 },
];

export function ReviewRunningClient() {
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
        pctRunner = setInterval(() => {
          if (cancelled) return;
          setPct((p) => Math.min(90, p + 1));
        }, 1500);

        const res = await fetch("/api/review/run-now", {
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
                | { type: "step"; step: string; label: string }
                | { type: "done"; review_id: string | null; week_starting: string }
                | { type: "error"; message: string };

              if (event.type === "step") {
                if (cancelled) continue;
                setSteps((prev) => [
                  ...prev,
                  { step: event.step, label: event.label, ts: Date.now() },
                ]);
                const matched = PHASES.find((p) => event.step.startsWith(p.match));
                if (matched) {
                  setPhase(matched.phase);
                  const idx = PHASES.indexOf(matched);
                  const cumWeight = PHASES.slice(0, idx + 1).reduce(
                    (s, p) => s + p.weight,
                    0
                  );
                  setPct((p) => Math.max(p, Math.min(90, cumWeight - 5)));
                }
              } else if (event.type === "done") {
                if (cancelled) continue;
                setPct(100);
                setPhase("Done");
                if (pctRunner) clearInterval(pctRunner);
                setTimeout(() => {
                  if (cancelled) return;
                  if (event.review_id) {
                    router.push(
                      `/app/review/${event.review_id}` as never
                    );
                  } else {
                    router.push("/app" as never);
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
          Running your weekly review
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">
          {phase}…
        </h1>
        <p className="mb-6 text-sm text-fg-muted">
          Pulling last week&apos;s posts, comparing against your goals, and
          writing your next 7-day plan. Usually 60–90 seconds.
        </p>

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

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated/40 p-4">
          {steps.length === 0 ? (
            <div className="text-xs text-fg-subtle">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Warming up…
            </div>
          ) : (
            steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              const isPast = i < steps.length - 1;
              return (
                <div
                  key={i}
                  className={
                    "flex items-start gap-3 text-sm " +
                    (isPast ? "text-fg-muted" : "text-fg")
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
          Stay on this page — we&apos;ll route you to the fresh review when
          it&apos;s ready.
        </div>
      </div>
    </main>
  );
}
