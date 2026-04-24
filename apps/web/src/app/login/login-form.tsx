"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const ERR: Record<string, string> = {
  not_authorized: "That email isn't on the Vanguard allowlist yet. Email ian@iepropertymgmt.com to request access.",
  expired: "That sign-in link expired. Send yourself a fresh one.",
  invalid: "Couldn't verify that link. Try again.",
  generic: "Something went wrong. Try again in a sec.",
};

export function LoginForm({ errorCode }: { errorCode?: string }) {
  const [email, setEmail] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const errMsg = localErr ?? (errorCode ? ERR[errorCode] ?? ERR.generic : null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    start(async () => {
      const db = supabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      if (error) {
        setLocalErr(error.message);
        return;
      }
      router.push(`/login?sent=1&email=${encodeURIComponent(email)}`);
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
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {errMsg ? (
        <p className="text-center text-sm text-danger">{errMsg}</p>
      ) : null}
    </form>
  );
}
