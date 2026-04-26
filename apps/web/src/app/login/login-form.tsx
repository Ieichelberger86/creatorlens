"use client";

import { useState, useTransition } from "react";

const ERR: Record<string, string> = {
  not_authorized:
    "That email isn't on the Vanguard allowlist yet. Email ian@iepropertymgmt.com to request access — or try the demo.",
  expired: "That sign-in link expired. Try again.",
  invalid: "Couldn't verify the sign-in. Try again.",
  generic: "Something went wrong. Try again in a sec.",
};

export function LoginForm({ errorCode }: { errorCode?: string }) {
  const [email, setEmail] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const errMsg = localErr ?? (errorCode ? ERR[errorCode] ?? ERR.generic : null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/auth/direct-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirect?: string;
          message?: string;
        };
        if (!res.ok || !body.redirect) {
          setLocalErr(body.message ?? "Sign-in failed. Try again.");
          return;
        }
        // Follow the Supabase verify URL — sets the auth cookie, then
        // routes to /auth/callback → /app
        window.location.href = body.redirect;
      } catch (err) {
        setLocalErr(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-left">
      <label className="text-sm text-fg-muted">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcreatorlife.com"
          className="mt-2 w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
      </label>
      <button type="submit" disabled={pending || !email} className="btn-primary mt-2">
        {pending ? "Logging in…" : "Log in"}
      </button>
      {errMsg ? (
        <p className="text-center text-sm text-danger">{errMsg}</p>
      ) : null}
    </form>
  );
}
