"use client";

import { useActionState } from "react";
import { saveOnboarding, type OnboardingState } from "./actions";

const initial: OnboardingState = { ok: false };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(saveOnboarding, initial);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="TikTok handle"
        name="tiktok_handle"
        placeholder="yourhandle"
        prefix="@"
        autoComplete="username"
        autoFocus
        error={state.fieldErrors?.tiktok_handle}
      />

      <FieldArea
        label="Your niche, in your own words"
        name="niche"
        placeholder="real estate investor making content for first-time investors who feel priced out of the market"
        rows={2}
        helper="One sentence. Specific beats clever — what would you tell a stranger at a bar?"
        error={state.fieldErrors?.niche}
      />

      <FieldArea
        label="What does winning look like in 90 days?"
        name="ninety_day_goal"
        placeholder="hit 50K followers, land 2 brand deals, and turn one viral video into a paid course"
        rows={2}
        helper="Concrete and measurable beats vague."
        error={state.fieldErrors?.ninety_day_goal}
      />

      {state.error ? (
        <p className="text-center text-sm text-danger">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary mt-2">
        {pending ? "Saving…" : "Meet Lens →"}
      </button>

      <p className="text-center text-[11px] text-fg-subtle">
        You can edit any of this later. Lens learns more about you with every
        conversation.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  prefix,
  error,
  ...rest
}: {
  label: string;
  name: string;
  prefix?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="text-sm text-fg-muted">
      {label}
      <div className="mt-2 flex items-stretch overflow-hidden rounded-lg border border-border bg-bg-elevated focus-within:border-accent">
        {prefix ? (
          <span className="flex select-none items-center bg-bg-subtle px-3 text-fg-muted">
            {prefix}
          </span>
        ) : null}
        <input
          name={name}
          required
          {...rest}
          className="flex-1 bg-transparent px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </div>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function FieldArea({
  label,
  name,
  helper,
  error,
  rows = 3,
  ...rest
}: {
  label: string;
  name: string;
  helper?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="text-sm text-fg-muted">
      {label}
      <textarea
        name={name}
        required
        rows={rows}
        {...rest}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
      />
      {helper ? (
        <span className="mt-1 block text-xs text-fg-subtle">{helper}</span>
      ) : null}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
