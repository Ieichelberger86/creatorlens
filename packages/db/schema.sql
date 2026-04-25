-- CreatorLens — Supabase schema
-- Apply with: supabase db push  OR  psql ... < schema.sql
-- Row-Level Security is enabled on every user-scoped table. Service role bypasses RLS.

-- =========================================================================
-- EXTENSIONS
-- =========================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================================================================
-- ENUMS
-- =========================================================================
do $$ begin
  create type user_tier as enum ('preorder', 'founding', 'standard', 'vanguard', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type container_status as enum ('provisioning', 'running', 'idle', 'paused', 'error', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type conversation_channel as enum ('web', 'telegram', 'discord');
exception when duplicate_object then null; end $$;

do $$ begin
  create type calendar_status as enum (
    'idea', 'drafting', 'shooting', 'edited', 'scheduled', 'posted', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- =========================================================================
-- USERS  (mirrors auth.users; Supabase Auth writes the auth row, we add metadata)
-- =========================================================================
create table if not exists public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text unique not null,
  stripe_customer_id    text unique,
  tier                  user_tier not null default 'preorder',
  vanguard_creator      boolean not null default false,
  telegram_user_id      text unique,
  discord_user_id       text unique,
  display_name          text,
  tiktok_handle         text,
  -- monthly token cap (null = unlimited; 0 = blocked); resets on UTC month boundary
  monthly_token_cap     bigint default 500000,
  monthly_tokens_used   bigint not null default 0,
  monthly_period_start  timestamptz not null default date_trunc('month', now() at time zone 'utc'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_users_email             on public.users(email);
create index if not exists idx_users_stripe_customer   on public.users(stripe_customer_id);
create index if not exists idx_users_tier              on public.users(tier);

alter table public.users enable row level security;

drop policy if exists "users: read self"   on public.users;
drop policy if exists "users: update self" on public.users;
create policy "users: read self"   on public.users for select using (auth.uid() = id);
create policy "users: update self" on public.users for update using (auth.uid() = id);

-- =========================================================================
-- CREATOR PROFILE  (1:1 with users; agent onboarding writes this)
-- =========================================================================
create table if not exists public.creator_profile (
  user_id         uuid primary key references public.users(id) on delete cascade,
  niche           text,
  voice_samples   text[] not null default '{}',
  top_videos      jsonb  not null default '[]'::jsonb,
  competitors     jsonb  not null default '[]'::jsonb,
  brand_notes     text,
  goals           jsonb  not null default '{}'::jsonb,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.creator_profile enable row level security;

drop policy if exists "creator_profile: read self"   on public.creator_profile;
drop policy if exists "creator_profile: upsert self" on public.creator_profile;
create policy "creator_profile: read self"   on public.creator_profile for select using (auth.uid() = user_id);
create policy "creator_profile: upsert self" on public.creator_profile for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- CONTAINERS  (per-creator Docker container on Contabo)
-- =========================================================================
create table if not exists public.containers (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  contabo_host    text,
  docker_id       text,
  subdomain       text unique,
  status          container_status not null default 'provisioning',
  last_active_at  timestamptz,
  token_budget    bigint not null default 500000,
  tokens_used     bigint not null default 0,
  byo_anthropic_key_encrypted text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_containers_user_id on public.containers(user_id);
create index if not exists idx_containers_status  on public.containers(status);

alter table public.containers enable row level security;

drop policy if exists "containers: read self" on public.containers;
create policy "containers: read self" on public.containers for select using (auth.uid() = user_id);

-- =========================================================================
-- CONVERSATIONS  (chat history across channels)
-- =========================================================================
create table if not exists public.conversations (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id) on delete cascade,
  channel      conversation_channel not null default 'web',
  title        text,
  messages     jsonb not null default '[]'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_conversations_user_id    on public.conversations(user_id);
create index if not exists idx_conversations_channel    on public.conversations(channel);
create index if not exists idx_conversations_last_msg   on public.conversations(last_message_at desc);

alter table public.conversations enable row level security;

drop policy if exists "conversations: read self"   on public.conversations;
drop policy if exists "conversations: upsert self" on public.conversations;
create policy "conversations: read self"   on public.conversations for select using (auth.uid() = user_id);
create policy "conversations: upsert self" on public.conversations for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- VIDEOS  (analyzed TikTok videos, competitor + own)
-- =========================================================================
create table if not exists public.videos (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  tiktok_url    text not null,
  tiktok_id     text,
  is_own        boolean not null default true,
  transcript    text,
  performance   jsonb not null default '{}'::jsonb,
  comments      jsonb not null default '[]'::jsonb,
  analyzed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, tiktok_url)
);

create index if not exists idx_videos_user_id     on public.videos(user_id);
create index if not exists idx_videos_analyzed_at on public.videos(analyzed_at desc);

alter table public.videos enable row level security;

drop policy if exists "videos: read self"   on public.videos;
drop policy if exists "videos: upsert self" on public.videos;
create policy "videos: read self"   on public.videos for select using (auth.uid() = user_id);
create policy "videos: upsert self" on public.videos for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- PREORDERS  (public — anyone can create via checkout; reads restricted to admin)
-- =========================================================================
create table if not exists public.preorders (
  id                          uuid primary key default uuid_generate_v4(),
  email                       text not null,
  stripe_payment_intent_id    text unique,
  stripe_checkout_session_id  text unique,
  amount_cents                integer not null default 1000,
  currency                    text not null default 'usd',
  status                      text not null default 'pending',
  converted                   boolean not null default false,
  converted_user_id           uuid references public.users(id) on delete set null,
  converted_at                timestamptz,
  utm_source                  text,
  utm_campaign                text,
  utm_medium                  text,
  referrer                    text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_preorders_email    on public.preorders(email);
create index if not exists idx_preorders_status   on public.preorders(status);
create index if not exists idx_preorders_created  on public.preorders(created_at desc);

alter table public.preorders enable row level security;

-- preorders are written by service role only (from Stripe webhook); reads are service role only.
-- No public policies.

-- =========================================================================
-- CONTENT CALENDAR  (per-creator content pipeline)
-- =========================================================================
create table if not exists public.content_calendar (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  status        calendar_status not null default 'idea',
  title         text not null,
  hook          text,
  script        text,
  notes         text,
  scheduled_for timestamptz,
  posted_at     timestamptz,
  posted_url    text,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_calendar_user_date    on public.content_calendar(user_id, scheduled_for);
create index if not exists idx_calendar_user_status  on public.content_calendar(user_id, status);
create index if not exists idx_calendar_user_created on public.content_calendar(user_id, created_at desc);

alter table public.content_calendar enable row level security;

drop policy if exists "calendar: read self"  on public.content_calendar;
drop policy if exists "calendar: write self" on public.content_calendar;
create policy "calendar: read self"  on public.content_calendar for select using (auth.uid() = user_id);
create policy "calendar: write self" on public.content_calendar for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- REFERRALS  (Phase 7, scaffolded now for forward compat)
-- =========================================================================
create table if not exists public.referrals (
  id              uuid primary key default uuid_generate_v4(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_email  text not null,
  referred_user_id uuid references public.users(id) on delete set null,
  status          text not null default 'pending',
  reward_granted  boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_user_id);
create index if not exists idx_referrals_email    on public.referrals(referred_email);

alter table public.referrals enable row level security;

drop policy if exists "referrals: read own" on public.referrals;
create policy "referrals: read own" on public.referrals for select using (auth.uid() = referrer_user_id);

-- =========================================================================
-- TRIGGERS  (auto-update updated_at)
-- =========================================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select unnest(array['users','creator_profile','containers','conversations','videos','preorders'])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at();', t);
  end loop;
end $$;

-- =========================================================================
-- AUTH HOOK  (insert into public.users when a new auth user signs up)
-- =========================================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
