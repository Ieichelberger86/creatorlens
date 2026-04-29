"use client";

import { useActionState, useState } from "react";
import { saveOnboarding, type OnboardingState } from "./actions";

const initial: OnboardingState = { ok: false };

const STREAM_OPTIONS: Array<{
  value: string;
  label: string;
  desc: string;
}> = [
  { value: "live_gifts", label: "Live gifts / diamonds", desc: "TikTok Live, viewers send virtual gifts" },
  { value: "creator_rewards", label: "Creator Rewards (per-view payout)", desc: "TikTok pays per 1K views on long-form" },
  { value: "brand_deals", label: "Brand deals / sponsorships", desc: "Paid posts for brands" },
  { value: "tiktok_shop_affiliate", label: "TikTok Shop affiliate", desc: "Tag products, earn commission on sales" },
  { value: "tiktok_shop_seller", label: "TikTok Shop seller", desc: "Sell your own products on TikTok Shop" },
  { value: "subscriptions", label: "Fan subscriptions", desc: "Paid subs for exclusive content" },
  { value: "lead_gen", label: "Lead gen → DMs / clients", desc: "Drive DMs to convert into your service or business" },
  { value: "info_product", label: "Course / coaching / ebook", desc: "Send traffic off-platform to a paid product" },
  { value: "ugc_contracts", label: "UGC content for brands", desc: "Get paid to produce content for brands' accounts" },
];

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(saveOnboarding, initial);
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);

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
        label="Your niche"
        name="niche"
        placeholder="real estate investor making content for first-time buyers"
        rows={2}
        helper="One sentence. Specific beats clever."
        error={state.fieldErrors?.niche}
      />

      <FieldArea
        label="90-day goal"
        name="ninety_day_goal"
        placeholder="hit 50K followers and land 2 brand deals"
        rows={2}
        helper="Numbers beat vibes."
        error={state.fieldErrors?.ninety_day_goal}
      />

      <fieldset className="text-sm text-fg-muted">
        <legend className="mb-2">How you make money</legend>
        <p className="mb-3 text-xs text-fg-subtle">
          Pick all that apply.
        </p>
        <div className="flex flex-col gap-2">
          {STREAM_OPTIONS.map((opt) => {
            const checked = selectedStreams.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition " +
                  (checked
                    ? "border-accent/50 bg-accent/10"
                    : "border-border bg-bg-elevated hover:border-border-subtle")
                }
              >
                <input
                  type="checkbox"
                  name="monetization_streams"
                  value={opt.value}
                  checked={checked}
                  onChange={(e) => {
                    setSelectedStreams((prev) =>
                      e.target.checked
                        ? [...prev, opt.value]
                        : prev.filter((v) => v !== opt.value)
                    );
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                />
                <div className="flex-1">
                  <div className="text-fg">{opt.label}</div>
                  <div className="text-xs text-fg-subtle">{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
        {state.fieldErrors?.monetization_streams ? (
          <p className="mt-2 text-xs text-danger">
            {state.fieldErrors.monetization_streams}
          </p>
        ) : null}
      </fieldset>

      {state.error ? (
        <p className="text-center text-sm text-danger">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary mt-2">
        {pending ? "Starting…" : "Continue →"}
      </button>

      <p className="text-center text-[11px] text-fg-subtle">
        Audit + 90-day goals + first weekly plan. ~90 seconds.
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
