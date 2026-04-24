import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to CreatorLens.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ sent?: string; error?: string; email?: string }>;
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
        {sp.sent === "1" ? (
          <>
            <h1 className="mb-2 font-display text-2xl font-semibold">
              Check your email
            </h1>
            <p className="mb-4 text-sm text-fg-muted">
              We sent a magic link to{" "}
              <span className="font-mono text-fg">{sp.email}</span>. Click it to
              sign in. The link expires in 15 minutes.
            </p>
            <Link href="/login" className="text-sm text-accent hover:text-accent-hover">
              Use a different email
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-2 font-display text-2xl font-semibold">
              Log in to your Lens
            </h1>
            <p className="mb-6 text-sm text-fg-muted">
              Enter your email. We&apos;ll send you a one-click sign-in link.
            </p>
            <LoginForm errorCode={sp.error} />
          </>
        )}
      </div>

      <div className="relative z-10 mt-6 text-center">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          ← back home
        </Link>
      </div>
    </main>
  );
}
