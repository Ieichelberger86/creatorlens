"use client";

import { useActionState, useState } from "react";
import { saveSettings, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

const STREAM_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
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

export type SettingsInitial = {
  tiktok_handle: string;
  display_name: string;
  niche: string;
  ninety_day_goal: string;
  brand_notes: string;
  monetization_streams: string[];
  voice_samples: string[];
};

export function SettingsForm({ initial: data }: { initial: SettingsInitial }) {
  const [state, formAction, pending] = useActionState(saveSettings, initial);
  const [streams, setStreams] = useState<string[]>(data.monetization_streams);
  const [voice, setVoice] = useState<string[]>(
    data.voice_samples.length > 0 ? data.voice_samples : [""]
  );

  function setVoiceAt(i: number, v: string) {
    setVoice((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }
  function addVoice() {
    if (voice.length < 10) setVoice((prev) => [...prev, ""]);
  }
  function removeVoice(i: number) {
    setVoice((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section title="Identity">
        <Field
          label="TikTok handle"
          name="tiktok_handle"
          defaultValue={data.tiktok_handle}
          prefix="@"
          autoComplete="username"
          error={state.fieldErrors?.tiktok_handle}
        />
        <Field
          label="Display name (optional)"
          name="display_name"
          defaultValue={data.display_name}
          placeholder={`@${data.tiktok_handle || "yourhandle"}`}
          required={false}
          error={state.fieldErrors?.display_name}
        />
      </Section>

      <Section title="Voice & positioning">
        <FieldArea
          label="Your niche"
          name="niche"
          rows={2}
          defaultValue={data.niche}
          helper="One sentence. Specific beats clever."
          error={state.fieldErrors?.niche}
        />
        <FieldArea
          label="What does winning look like in 90 days?"
          name="ninety_day_goal"
          rows={2}
          defaultValue={data.ninety_day_goal}
          helper="Concrete and measurable beats vague."
          error={state.fieldErrors?.ninety_day_goal}
        />
        <FieldArea
          label="Brand notes (optional)"
          name="brand_notes"
          rows={3}
          defaultValue={data.brand_notes}
          required={false}
          helper="Anything Lens should always remember — taboos, tone rules, personal positioning, recurring themes."
          error={state.fieldErrors?.brand_notes}
        />
      </Section>

      <Section title="How do you make money?">
        <fieldset className="text-sm text-fg-muted">
          <p className="mb-3 text-xs text-fg-subtle">
            Lens uses this on every recommendation — different streams need
            different hooks.
          </p>
          <div className="flex flex-col gap-2">
            {STREAM_OPTIONS.map((opt) => {
              const checked = streams.includes(opt.value);
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
                      setStreams((prev) =>
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
      </Section>

      <Section title="Voice samples">
        <p className="text-xs text-fg-subtle">
          Phrases or one-liners Lens should mimic when writing in your voice.
          Up to 10. The first 3 are weighted heaviest.
        </p>
        <div className="flex flex-col gap-2">
          {voice.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="voice_samples"
                value={v}
                onChange={(e) => setVoiceAt(i, e.target.value)}
                placeholder={`Sample ${i + 1}`}
                className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
              {voice.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeVoice(i)}
                  className="text-xs text-fg-subtle hover:text-danger"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          {voice.length < 10 ? (
            <button
              type="button"
              onClick={addVoice}
              className="self-start text-xs text-accent hover:underline"
            >
              + Add sample
            </button>
          ) : null}
        </div>
      </Section>

      {state.error ? (
        <p className="text-sm text-danger">{state.error}</p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-success">Saved.</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <p className="text-xs text-fg-subtle">
          Lens picks up changes on the next message.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-bg-elevated/40 p-5">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-fg-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  prefix,
  error,
  required = true,
  ...rest
}: {
  label: string;
  name: string;
  prefix?: string;
  error?: string;
  required?: boolean;
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
          required={required}
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
  required = true,
  ...rest
}: {
  label: string;
  name: string;
  helper?: string;
  error?: string;
  required?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="text-sm text-fg-muted">
      {label}
      <textarea
        name={name}
        required={required}
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
