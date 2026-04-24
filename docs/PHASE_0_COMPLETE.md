# PHASE 0 — COMPLETE (local scaffold)

## Built

- Monorepo structure (pnpm workspaces, TypeScript 5.6, Node 20+)
  - `apps/web` — Next.js 15 + Tailwind + Geist + dark theme, hero landing placeholder, `/api/health`
  - `apps/api` — Express + pino + Stripe webhook (raw body) + `/preorders` Checkout Session endpoint
  - `apps/agent` — Dockerfile (alpine, chromium, ffmpeg, non-root, `/data` volume) + WebSocket stub + `lens-system.md` starter prompt
  - `packages/db` — Supabase admin + anon client factories, hand-written types matching schema
  - `packages/shared` — brand tokens, pricing, channel/tier constants
- `packages/db/schema.sql` — users, creator_profile, containers, conversations, videos, preorders, referrals with RLS policies, auto-`updated_at` triggers, and an `auth.users → public.users` insert hook
- Root config: `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`
- `docs/ROADMAP.md` — full 8-phase roadmap

## Deployed

Nothing external yet. Awaiting Ian's confirmation on blockers below.

## Blockers for Ian

1. **Domain** — default `creatorlens.app` (buy via Vercel). Alt: `joinvanguard.agency/lens`.
2. **GitHub repo** — default `Ieichelberger86/creatorlens`, **public**.
3. **Stripe** — default: add products to existing LoanAtlas Stripe account. Alt: new account.
4. **Supabase** — `supabase login` needed, then confirm org for the new project.
5. **Accent color** — default electric violet `#8B5CF6`. Alt: lime `#84CC16`.
6. **Phase 2 pre-reqs** (can come later) — Contabo SSH creds, pooled Anthropic API key.

## Next (Phase 0 externals)

Once Ian unblocks:
- `gh repo create creatorlens --public` + push
- `stripe product/price create` for Founding $29/mo + Pre-order $10 (via Stripe MCP)
- `supabase projects create` + `supabase db push` for schema
- Vercel project link to `apps/web`
- Railway project link to `apps/api` (via `railway.toml`)

Then Phase 1 starts: landing page content, pre-order checkout wiring, admin dashboard.
