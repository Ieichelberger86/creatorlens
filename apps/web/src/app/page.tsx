import { BRAND } from "@creatorlens/shared";
import { PRICING } from "@creatorlens/shared/pricing";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px] hero-glow"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-accent" />
          <span className="font-display text-lg font-semibold tracking-tight">
            {BRAND.productName}
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-fg-muted">
          <Link href="#how-it-works" className="hover:text-fg transition">
            How it works
          </Link>
          <Link href="#faq" className="hover:text-fg transition">
            FAQ
          </Link>
          <Link href="/login" className="hover:text-fg transition">
            Log in
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="animate-fade-in-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-glow" />
            Pre-launch · Founding spots open
          </div>

          <h1 className="font-display text-display-lg sm:text-display-xl font-bold tracking-tight">
            Your AI co-pilot
            <br />
            for <span className="text-accent">TikTok growth</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-fg-muted sm:text-xl">
            {BRAND.description} Lives in the cloud, works while you sleep,
            remembers everything about your brand.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/preorder" className="btn-primary">
              Reserve your spot — ${(PRICING.preorder.oneTimeCents / 100).toFixed(0)} deposit
            </Link>
            <Link href="#how-it-works" className="btn-secondary">
              See how it works
            </Link>
          </div>

          <p className="mt-4 text-sm text-fg-subtle">
            ${(PRICING.founding.monthlyCents / 100).toFixed(0)}/mo locked forever · cancel anytime ·
            Vanguard creators free
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        className="relative z-10 border-t border-border py-24"
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">
            One agent. Six tools.{" "}
            <span className="text-fg-muted">Zero context-switching.</span>
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="mb-3 font-display text-lg font-semibold">
                  {f.title}
                </div>
                <p className="text-sm text-fg-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="relative z-10 border-t border-border py-24">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-display text-4xl font-bold tracking-tight">
            Questions.
          </h2>
          <div className="mt-10 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q} className="card">
                <div className="mb-2 font-semibold">{f.q}</div>
                <p className="text-sm text-fg-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-fg-subtle">
          <div>© {new Date().getFullYear()} Vanguard Agency.</div>
          <div>{BRAND.supportEmail}</div>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    title: "Hook lab",
    body: "Generates and A/B tests video hooks based on your niche and top-performing videos.",
  },
  {
    title: "Trend scout",
    body: "Monitors TikTok + IG trending sounds and formats relevant to your niche 24/7.",
  },
  {
    title: "Script generator",
    body: "Writes scripts in your voice, learned from your uploaded transcripts.",
  },
  {
    title: "Comment mining",
    body: "Scrapes your comments (and competitors') to find content ideas and pain points.",
  },
  {
    title: "Post-mortem",
    body: "After a video posts, Lens analyzes performance and suggests what to do next.",
  },
  {
    title: "Content calendar",
    body: "Maintains your posting schedule. Reminds you. Never lets the feed go cold.",
  },
] as const;

const FAQ = [
  {
    q: "What is CreatorLens?",
    a: "Every member gets a private AI agent — Lens — that lives in the cloud, runs 24/7, and is pre-loaded with creator-specific tools. Talk to it via web, Telegram, or Discord.",
  },
  {
    q: "Why containerized?",
    a: "Your agent is isolated to you. Your data, your brand notes, your voice samples never mix with anyone else's. Safer and more private than sharing a chatbot with the world.",
  },
  {
    q: "When does it launch?",
    a: "Pre-orders open now. Paid members get access as soon as their container is provisioned — waves start within days of launch.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. Per-creator isolation, encrypted storage, no training on your content. Cancel anytime and your container is deleted within 24 hours.",
  },
  {
    q: "I'm a Vanguard creator — how do I claim free access?",
    a: "Log in with your Vanguard email and your account will auto-upgrade. If it doesn't, email us.",
  },
] as const;
