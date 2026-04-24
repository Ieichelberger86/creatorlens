import Link from "next/link";
import type { Metadata } from "next";
import { PRICING } from "@creatorlens/shared/pricing";

export const metadata: Metadata = {
  title: "Reserve your spot",
  description: "$10 deposit locks in $29/mo founding-member pricing forever.",
};

const deposit = (PRICING.preorder.oneTimeCents / 100).toFixed(0);
const monthly = (PRICING.founding.monthlyCents / 100).toFixed(0);

// UTM + referrer search params are preserved as Stripe metadata by appending
// them to the Payment Link URL. Stripe forwards them to checkout.session.completed.
type PageProps = {
  searchParams: Promise<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    ref?: string;
    email?: string;
  }>;
};

export default async function PreorderPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const base = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "";
  const url = new URL(base || "https://creatorlens.app/preorder");
  if (sp.email) url.searchParams.set("prefilled_email", sp.email);
  // Stripe Payment Links do not accept arbitrary query metadata — utm/ref are
  // captured on the thanks page instead and reconciled against the session.

  const checkoutHref = base ? url.toString() : undefined;

  return (
    <main className="relative mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center px-6 py-16">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
        Founding spots are limited
      </div>

      <h1 className="mb-4 text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Reserve your <span className="text-accent">Lens</span>.
      </h1>
      <p className="mb-10 max-w-md text-center text-fg-muted">
        ${deposit} deposit — credited toward your first month. Locks in{" "}
        <strong className="text-fg">${monthly}/mo forever</strong>. Refundable
        until your container is provisioned.
      </p>

      {checkoutHref ? (
        <a href={checkoutHref} className="btn-primary w-full max-w-sm text-base">
          Continue to Stripe — ${deposit}
        </a>
      ) : (
        <button className="btn-primary w-full max-w-sm text-base opacity-50" disabled>
          Checkout temporarily unavailable
        </button>
      )}

      <ul className="mt-10 space-y-3 text-sm text-fg-muted">
        <li className="flex items-start gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>Founding pricing locks in the day you deposit — never goes up.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>Full refund anytime before your container is provisioned.</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>Vanguard creators get it free — log in with your Vanguard email.</span>
        </li>
      </ul>

      <div className="mt-10 text-center">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          ← back home
        </Link>
      </div>
    </main>
  );
}
