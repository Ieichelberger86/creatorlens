export const BRAND = {
  productName: "CreatorLens",
  agentName: "Lens",
  tagline: "Your AI co-pilot for TikTok growth",
  description:
    "Hooks, scripts, trends, analytics — one agent that learns your brand and runs 24/7.",
  founderEmail: "ian@iepropertymgmt.com",
  supportEmail: "hello@creatorlens.app",
  colors: {
    bg: "#0A0A0B",
    bgElevated: "#111113",
    border: "#1F1F23",
    text: "#FAFAFA",
    textMuted: "#A1A1AA",
    accent: "#8B5CF6", // electric violet
    accentHover: "#7C3AED",
    success: "#84CC16",
    danger: "#EF4444",
  },
} as const;

export const CHANNELS = ["web", "telegram", "discord"] as const;

export const TIERS = [
  "preorder",
  "founding",
  "standard",
  "vanguard",
  "admin",
] as const;
