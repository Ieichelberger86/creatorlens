import Link from "next/link";
import type { Metadata } from "next";
import { PRICING } from "@creatorlens/shared/pricing";

export const metadata: Metadata = {
  title: "Reserve your spot",
  description: "$10 deposit locks in $29/mo founding-member pricing forever.",
};

const deposit = (PRICING.preorder.oneTimeCents / 100).toFixed(0);
const monthly = (PRICING.founding.monthlyCents / 100).toFixed(0);

export default function PreorderPage() {
  return (
    <main className="relative mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
        Founding spots are limited
      </div>

      <h1 className="mb-4 text-center font-display text-4xl font-bold tracking-tight">
        Reserve your <span className="text-accent">Lens</span>.
      </h1>
      <p className="mb-8 max-w-md text-center text-fg-muted">
        ${deposit} deposit — credited toward your first month. Locks in{" "}
        <strong className="text-fg">${monthly}/mo forever</strong>. Refundable
        until your container is provisioned.
      </p>

      <form
        action="/api/preorder/checkout"
        method="POST"
        className="flex w-full flex-col gap-3"
      >
        <label className="text-sm text-fg-muted">
          Your email
          <input
            name="email"
            type="email"
            required
            placeholder="you@yourcreatorlife.com"
            className="mt-2 w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
        </label>
        <button type="submit" className="btn-primary mt-2" disabled>
          Continue to Stripe — ${deposit}
        </button>
        <p className="text-center text-xs text-fg-subtle">
          Checkout wiring ships in the next deploy. Form is live but the submit
          is disabled for a few hours while we finish plumbing.
        </p>
      </form>

      <div className="mt-10 text-center">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          ← back home
        </Link>
      </div>
    </main>
  );
}
