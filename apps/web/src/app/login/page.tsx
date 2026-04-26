import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to CreatorLens.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  return (
    <main className="relative mx-auto flex min-h-[90dvh] max-w-md flex-col items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px] hero-glow"
      />

      <Link href="/" className="relative z-10 mb-8 flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-accent" />
        <span className="font-display text-lg font-semibold tracking-tight">
          CreatorLens
        </span>
      </Link>

      <div className="card relative z-10 w-full text-center">
        <h1 className="mb-2 font-display text-2xl font-semibold">
          Log in to your Lens
        </h1>
        <p className="mb-6 text-sm text-fg-muted">
          Enter your email. We&apos;ll log you in instantly — no password
          or magic link required.
        </p>
        <LoginForm errorCode={sp.error} />
      </div>

      <div className="relative z-10 mt-6 flex flex-col items-center gap-3 text-center">
        <a
          href="/demo"
          className="rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
        >
          ✨ Try the demo (no signup)
        </a>
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          ← back home
        </Link>
      </div>
    </main>
  );
}
