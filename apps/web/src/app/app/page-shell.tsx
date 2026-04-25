import type { ReactNode } from "react";

/**
 * Standard page wrapper for /app/* routes (excluding the dashboard `/app`
 * itself and `/app/c/[id]` chat which need their own layouts).
 *
 * Provides:
 * - Consistent max-width container
 * - Standard title block (route label + title + subtitle)
 * - Optional actions slot rendered at the right edge of the header
 */
export function PageShell({
  routeLabel,
  title,
  subtitle,
  actions,
  children,
  width = "default",
}: {
  routeLabel?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "default" | "narrow" | "wide";
}) {
  const maxWidth =
    width === "narrow"
      ? "max-w-2xl"
      : width === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  return (
    <main className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-8 sm:px-6`}>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          {routeLabel ? (
            <div className="font-mono text-xs text-fg-subtle">{routeLabel}</div>
          ) : null}
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <div className="mt-1 text-sm text-fg-muted">{subtitle}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </main>
  );
}
