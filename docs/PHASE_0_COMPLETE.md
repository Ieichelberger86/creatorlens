# PHASE 0 — COMPLETE ✅

## Live URLs

| Service | URL | Status |
|---|---|---|
| Marketing + app shell (Next.js) | [creatorlens.app](https://creatorlens.app) | **LIVE** ✅ |
| API (Express) | [api-production-fec4.up.railway.app](https://api-production-fec4.up.railway.app/health) | **LIVE** ✅ |
| www redirect | www.creatorlens.app → apex (308) | Verified ✅ |
| GitHub | [Ieichelberger86/creatorlens](https://github.com/Ieichelberger86/creatorlens) | Public ✅ |

## Infra

| Platform | Resource | Status |
|---|---|---|
| Vercel | project `prj_1fiuTrkMluqAYTbGycAdfLgURzdo`, rootDirectory `apps/web`, framework nextjs | Auto-deploy from main ✅ |
| Vercel | domains `creatorlens.app`, `www.creatorlens.app` | Attached + verified ✅ |
| Railway | project `creatorlens-api` (`35f8c0b9-…`), service `api` (`b53f6abf-…`) | Deployed from `railway up` ✅ |
| Railway | deploymentTrigger on `main` branch | Added — future pushes auto-deploy ✅ |
| Stripe | account **AddAiPro LLC** (`acct_1SalBz3WtTvxXWPu`), **live mode** | — |
| Stripe | product `prod_UOaCGzG5kzxHAY` "CreatorLens Founding Member" + price `price_1TPnWe3WtTvxXWPupNbbRzXe` ($29/mo) | Live ✅ |
| Stripe | product `prod_UOaCh3PFr9ycIR` "CreatorLens Pre-Order Deposit" + price `price_1TPnWh3WtTvxXWPuxzMcVOd3` ($10 one-time) | Live ✅ |
| Stripe | 3 ghost products from prior iteration archived (Pro / Creator / Agency) | Archived ✅ |

## Known remaining tasks

- **Supabase project** — blocked, needs user access token (`sbp_xxx` from supabase.com/dashboard/account/tokens)
- **api.creatorlens.app custom domain on Railway** — Railway reports an internal conflict (old project still holds a lease). Manual release via Railway dashboard fixes it.
- **Stripe webhook secret** — not yet set; wire in Phase 1 when checkout endpoint goes live.
- **Anthropic pooled API key, Contabo SSH creds** — needed for Phase 2.

## Notable build fixes made in Phase 0

- Next 15 moved `typedRoutes` out of `experimental` — moved in `next.config.mjs`
- Webpack `extensionAlias` added so workspace packages can use `.js` specifiers that resolve to `.ts` source
- Placeholder `/login` and `/preorder` routes so typedRoutes doesn't fail the build
- `apps/api` now bundles with **tsup** (`noExternal: /^@creatorlens\//`) so Node can run the compiled output without hitting `.ts` source in workspace deps
- Railway `targetPort` fixed to 8080 (Railway-assigned, not my default 4000)

## Phase 1 — start list

Target: 48 hours from Phase 0 handoff.

1. Real `/preorder` → POST `/api/preorder/checkout` proxy → Express `/preorders` → Stripe Checkout Session (live)
2. Enable the submit button, gate behind email validation
3. Stripe webhook endpoint live (need webhook signing secret from Ian/Stripe dashboard)
4. Admin `/admin` dashboard: pre-order count, revenue, funnel (password-gated)
5. Resend transactional "you're in" email + Discord invite link
6. PostHog analytics + OG image + richer FAQ copy
7. Video embed slot in hero (Ian posts a TikTok demo)
