import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to your CreatorLens account.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center px-6">
      <div className="mb-8 flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-accent" />
        <span className="font-display text-lg font-semibold tracking-tight">
          CreatorLens
        </span>
      </div>
      <div className="card w-full text-center">
        <h1 className="mb-3 font-display text-2xl font-semibold">
          Log in comes with launch
        </h1>
        <p className="text-sm text-fg-muted">
          Magic-link auth goes live when pre-order members are invited in.
          If you&apos;ve already reserved a spot, watch your inbox.
        </p>
        <div className="mt-6">
          <Link href="/" className="btn-secondary">
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
