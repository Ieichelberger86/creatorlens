import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're in",
  description: "Welcome to CreatorLens founding cohort.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function ThanksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sessionId = sp.session_id ?? null;

  return (
    <main className="relative mx-auto flex min-h-[80dvh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] hero-glow"
      />

      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Reserved
        </div>

        <h1 className="mb-4 font-display text-5xl font-bold tracking-tight">
          You&apos;re in.
        </h1>
        <p className="mx-auto mb-10 max-w-md text-fg-muted">
          Your Founding Member spot is locked. We&apos;ll email you the moment
          your Lens container is ready to provision — and a $10 credit will be
          applied to your first month automatically.
        </p>

        <div className="card mx-auto max-w-md text-left">
          <div className="mb-2 font-display font-semibold">What happens next</div>
          <ol className="space-y-3 text-sm text-fg-muted">
            <li className="flex gap-3">
              <span className="font-mono text-accent">1.</span>
              <span>Check your inbox for a confirmation from Stripe.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-accent">2.</span>
              <span>
                Watch your email — launch invites go out in waves. Founding
                members get first access.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-accent">3.</span>
              <span>
                Follow the build in public on{" "}
                <a
                  href="https://www.tiktok.com/@ianeichelberger"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:text-accent-hover"
                >
                  TikTok
                </a>
                .
              </span>
            </li>
          </ol>
        </div>

        {sessionId ? (
          <p className="mt-8 font-mono text-[10px] text-fg-subtle">
            ref: {sessionId}
          </p>
        ) : null}

        <div className="mt-10">
          <Link href="/" className="btn-secondary">
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
