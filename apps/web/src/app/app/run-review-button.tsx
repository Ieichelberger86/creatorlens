"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

/**
 * Manual "run my review now" button. Posts to /api/review/run-now,
 * streams progress, redirects when done.
 *
 * This page itself only fires once — if the user wants live progress
 * they go through /app/review/running.
 */
export function RunReviewButton({
  variant = "primary",
  label = "Run review",
}: {
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          router.push("/app/review/running" as Route);
        })
      }
      className={
        (variant === "primary" ? "btn-primary" : "btn-secondary") +
        " text-sm disabled:opacity-50"
      }
    >
      {pending ? "Running…" : label}
    </button>
  );
}
