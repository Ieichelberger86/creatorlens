# CreatorLens

Your AI co-pilot for TikTok growth. Lives in the cloud, works while you sleep.

Every creator gets a containerized AI agent — "Lens" — that lives 24/7, remembers everything, and ships creator-native tooling out of the box: hook labs, trend scouting, script generation, comment mining, post-mortems, content calendars.

## Status

Pre-launch. Pre-order deposit live at [creatorlens.app](https://creatorlens.app).

- **Founding member:** $29/mo locked forever
- **Pre-order:** $10 deposit, credited toward first month
- **Vanguard creators:** free

## Stack

| Layer | Tech | Deploy |
|---|---|---|
| Marketing + App shell | Next.js 14 | Vercel |
| API / provisioner | Express + TypeScript | Railway |
| Agent container | Node + Claude Agent SDK | Docker → Contabo |
| Database | Supabase (Postgres) | Supabase Cloud |
| Payments | Stripe | — |
| Analytics | PostHog | — |

## Monorepo

```
apps/
  web/        Next.js 14 — marketing, app shell, admin
  api/        Express — provisioner, Stripe webhooks, auth
  agent/      Docker image — per-creator Lens container
packages/
  db/         Supabase client + schema + types
  shared/     Shared types, prompt fragments, constants
```

## Local dev

```bash
pnpm install
pnpm dev         # runs all apps in parallel
pnpm web:dev     # just the web app
pnpm api:dev     # just the api
```

## Phases

See [docs/ROADMAP.md](./docs/ROADMAP.md).

- [x] Phase 0 — Infra + monorepo
- [ ] Phase 1 — Landing + pre-order flow (48hr target)
- [ ] Phase 2 — Agent container architecture
- [ ] Phase 3 — Lens system prompt + tool suite
- [ ] Phase 4 — Multi-channel access (web, Telegram, Discord)
- [ ] Phase 5 — Pre-order → paid conversion flow
- [ ] Phase 6 — Community + content loop
- [ ] Phase 7 — Growth mechanics

## License

Proprietary. © Vanguard Agency.
