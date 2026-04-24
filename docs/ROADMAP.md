# CreatorLens — Roadmap

Source of truth for phased build. Keep in sync with the master execution prompt.

---

## Phase 0 — Infra + monorepo scaffold

- Monorepo with `apps/{web,api,agent}` and `packages/{db,shared}`
- Supabase schema + RLS
- Stripe products (Founding $29/mo, Pre-order $10)
- Vercel (web) + Railway (api) projects linked to GitHub
- Placeholder landing page

## Phase 1 — Landing + pre-order (48h target)

- Live marketing page at `creatorlens.app`
- Hero, video slot, FAQ, pre-order CTA
- Stripe Checkout for $10 deposit → Supabase `preorders` row via webhook
- Thanks page → Discord invite + expectations
- Admin dashboard (`/admin`, password-gated): real-time pre-order count, revenue, funnel
- PostHog analytics

## Phase 2 — Agent container architecture

- Finalize Docker image (Claude Agent SDK, playwright, ffmpeg, Apify client, ElevenLabs)
- Provisioner in `apps/api/lib/provisioner.ts`: SSH to Contabo, spin up container with unique subdomain, inject env
- Per-user token cap (500K/mo) + BYO Anthropic key option
- Pause after 30 min idle, resume on message, delete on cancellation
- Memory: per-container SQLite volume + periodic Supabase sync

## Phase 3 — Lens system prompt + tools

- Finalize `lens-system.md`
- Tool registry: `analyzeVideo`, `generateHooks`, `findTrends`, `draftScript`, `scheduleContent`, `mineComments`, `postMortem`
- Onboarding flow (niche, goals, top 3 videos, voice samples, competitors)
- Personalized 7-day content plan deliverable

## Phase 4 — Multi-channel access

- Web UI at `{user_id}.lens.creatorlens.app` (chat, uploads, video embeds)
- Telegram bot (one bot, routes by linked telegram_user_id)
- Discord bot (DM-based, same pattern)
- Magic-link auth → JWT; one-time code to link Telegram/Discord

## Phase 5 — Pre-order → paid conversion

- Launch email to all pre-orders with private signup link
- $10 credit applied to first month ($29 - $10 = $19)
- Stripe subscription lifecycle wired to `users.tier`
- Welcome: email + Discord + web + linking prompts
- Admin conversion dashboard (pre-order → paid %, churn, MRR)

## Phase 6 — Community + content loop

- Discord structure: #announcements, #wins, #lens-help, #feature-requests, #founding-members
- Weekly "Lens Live" on Discord voice
- Auto-generated viral social proof when a user's video crosses 100K views with Lens's help

## Phase 7 — Growth mechanics

- Referral: 1 month free per referral, $10 off for referred
- Vanguard program: all 30 creators free, testimonials required
- Affiliate: 30% recurring commission
- Content template: weekly "Day in the life of my AI co-pilot" for Ian's TikTok

---

## Success metrics (first 30 days)

| Metric | Target |
|---|---|
| Pre-orders | 500+ @ $10 = $5K validation |
| Pre-order → paid | 40%+ = 200 paying = ~$5.8K MRR |
| Viral Ian TikToks | 5+ |
| Week-1 paid churn | <5% |
