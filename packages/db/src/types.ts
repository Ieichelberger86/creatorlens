// Hand-written types matching schema.sql. Once a Supabase project exists, run
// `pnpm --filter @creatorlens/db gen:types` to regenerate a stricter version.

export type UserTier = "preorder" | "founding" | "standard" | "vanguard" | "admin";

export type ContainerStatus =
  | "provisioning"
  | "running"
  | "idle"
  | "paused"
  | "error"
  | "terminated";

export type ConversationChannel = "web" | "telegram" | "discord";

export interface User {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  tier: UserTier;
  vanguard_creator: boolean;
  telegram_user_id: string | null;
  discord_user_id: string | null;
  display_name: string | null;
  tiktok_handle: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorProfile {
  user_id: string;
  niche: string | null;
  voice_samples: string[];
  top_videos: Array<{ url: string; transcript?: string; views?: number }>;
  competitors: Array<{ handle: string; url?: string }>;
  brand_notes: string | null;
  goals: Record<string, unknown>;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Container {
  id: string;
  user_id: string;
  contabo_host: string | null;
  docker_id: string | null;
  subdomain: string | null;
  status: ContainerStatus;
  last_active_at: string | null;
  token_budget: number;
  tokens_used: number;
  byo_anthropic_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  channel: ConversationChannel;
  title: string | null;
  messages: ConversationMessage[];
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  user_id: string;
  tiktok_url: string;
  tiktok_id: string | null;
  is_own: boolean;
  transcript: string | null;
  performance: Record<string, unknown>;
  comments: Array<{ text: string; likes?: number; author?: string }>;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Preorder {
  id: string;
  email: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "failed";
  converted: boolean;
  converted_user_id: string | null;
  converted_at: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  referrer: string | null;
  created_at: string;
  updated_at: string;
}
