import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tryParseJson } from "../parse.js";

export const reviewBrandDealTool: Anthropic.Tool = {
  name: "review_brand_deal",
  description:
    "Analyze a brand-deal pitch the creator received (paste of an email, DM, or any text-form offer). Detects scam patterns, extracts the actual terms, gives a verdict (looks_legit / negotiate / high_risk / walk_away), and drafts a recommended response in the creator's voice. Persists the review to the brand_deals table so it shows up at /app/brand-deals. Use whenever the creator pastes a brand pitch or asks 'is this legit?'.",
  input_schema: {
    type: "object",
    properties: {
      offer_text: {
        type: "string",
        description:
          "The full text of the offer — paste of the email, DM, voicemail transcript, or however it came in. Required.",
      },
      brand_name_hint: {
        type: "string",
        description: "Optional: the creator's best guess at the brand name if it isn't obvious in the offer text.",
      },
    },
    required: ["offer_text"],
  },
};

type Verdict = "looks_legit" | "negotiate" | "high_risk" | "walk_away";

type Analysis = {
  brand_name: string | null;
  contact: string | null;
  offer_amount_cents: number | null;
  currency: string;
  deliverables: Record<string, unknown>;
  deadlines: Record<string, unknown>;
  exclusivity: string | null;
  usage_rights: string | null;
  red_flags: string[];
  green_flags: string[];
  verdict: Verdict;
  summary_markdown: string;
  recommended_response: string;
};

export async function reviewBrandDealExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { offer_text, brand_name_hint } = input as {
    offer_text: string;
    brand_name_hint?: string;
  };

  if (!offer_text || offer_text.trim().length < 30) {
    return "Need the full offer text to review — paste the email or DM the brand sent.";
  }

  // Pull the creator's voice for the recommended response
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, brand_notes, monetization_streams")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const { data: u } = await db
    .from("users")
    .select("tiktok_handle, display_name")
    .eq("id", ctx.userId)
    .maybeSingle();

  const handle = u?.tiktok_handle;
  const niche = profile?.niche;
  const voiceSamples = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 3);

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 2200,
    system: `You're Lens reviewing a brand-deal pitch a creator received. You output ONE valid JSON object matching this exact schema, no preamble, no markdown fence, no commentary:

{
  "brand_name": string | null,
  "contact": string | null,                // email / handle / phone they reached out from
  "offer_amount_cents": integer | null,    // total cash offered, in USD cents. Null if free/product-only.
  "currency": string,                      // 3-letter ISO; default "usd"
  "deliverables": {                        // what they're being asked to produce
    "videos": integer | null,
    "lives": integer | null,
    "stories": integer | null,
    "in_caption_link": boolean,
    "in_bio_link": boolean,
    "exclusive_post": boolean,
    "other": string | null
  },
  "deadlines": {
    "submission_due": string | null,       // ISO date if mentioned
    "post_window": string | null
  },
  "exclusivity": string | null,            // verbatim or one-line summary
  "usage_rights": string | null,           // how brand can use the content (whitelisting, paid amplification, perpetual, etc.)
  "red_flags": [string, ...],              // concrete scam/risk signals from the text
  "green_flags": [string, ...],            // legit signals
  "verdict": "looks_legit" | "negotiate" | "high_risk" | "walk_away",
  "summary_markdown": string,              // a 200-350 word markdown report — see format below
  "recommended_response": string           // 80-180 word reply drafted IN THE CREATOR'S VOICE
}

KNOWN SCAM PATTERNS — flag any that appear:
- Asking the creator to pay anything upfront (shipping, "verification fee", taxes)
- Crypto / gift card / wire transfer / Zelle as payment method
- Free product only when the offer claims to be a "campaign" or has cash-equivalent deliverables
- Aggressive urgency ("must respond in 24h", "limited spots")
- Asking for SSN / bank account / passport / credit card upfront
- Generic "[BRAND]" or "[CREATOR]" placeholder tokens left in the message
- Vague brand with no website / unverifiable presence
- @gmail.com / @yahoo.com / @outlook.com instead of company domain
- Discord-only or Telegram-only contact
- Pyramid / MLM structure ("refer 3 friends, unlock bonus")
- Asking for full content rights without paying for them
- Posting frequency demands wildly out of line with offered comp
- Brand impersonation (real brand name, fake domain like nike-creator.com)
- "We'll pay after you post" with no escrow / contract
- Bot-grammar (machine-translated stilted phrasing)

LEGIT SIGNALS:
- Company domain matches the brand
- Specific named contact at a real company
- Clear cash amount in dollars
- Defined deliverables with quantities
- Posting window + content review process spelled out
- Reasonable exclusivity scope (e.g., 30-day non-compete in same category, not lifetime all-content)
- Mention of a contract / W-9 / payment via NET-30 / standard rates

VERDICT GUIDE:
- looks_legit: zero red flags, named brand, real cash, sane terms. Recommend accept or simple negotiation.
- negotiate: legit on the surface but terms are off-market — usage rights too broad, comp too low, exclusivity too long. Recommend specific counter-offer.
- high_risk: 1-2 red flags but not certain scam. Recommend clarifying questions before accepting.
- walk_away: 3+ red flags or any scam-pattern dealbreaker (upfront payment, crypto, asking for SSN). Recommend ignore/block.

summary_markdown FORMAT (300-450 words, no preamble):

## Verdict: <human-readable verdict line>

**One-sentence call** — what it is, what they're offering.

### What they want
- <bullet list of concrete deliverables>

### What you'd get
- Cash: <amount or "none">
- Product: <what>
- Other: <whitelisting / amplification / etc.>

### Red flags
- <each one, briefly>

### Green flags
- <each one>

### What I'd do
<2-3 sentences with concrete next step. Be opinionated. If walk-away, say so directly. If negotiate, say what to counter for.>

recommended_response — write IN THE CREATOR'S VOICE (use the voice samples below). 80-180 words. If walk_away, output a short polite decline. If negotiate, output a counter that names specific terms. If looks_legit, output an enthusiastic accept that asks for next steps. If high_risk, output a clarifying-questions message asking for what's missing.`,
    messages: [
      {
        role: "user",
        content: `Creator: @${handle ?? "creator"}
Niche: ${niche ?? "(unknown)"}
Monetization streams: ${(profile?.monetization_streams ?? []).join(", ") || "(unknown)"}
Voice samples (use these to write the recommended response):
${voiceSamples.length ? voiceSamples.map((v) => `- "${v}"`).join("\n") : "- (no samples — keep tone warm, direct, creator-native)"}
${profile?.brand_notes ? `\nBrand notes:\n${profile.brand_notes}` : ""}

Brand name hint: ${brand_name_hint ?? "(none)"}

OFFER TEXT (verbatim from the creator):
"""
${offer_text.trim()}
"""`,
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const analysis = tryParseJson<Analysis>(raw);
  if (!analysis) {
    return `Couldn't parse the deal review (model returned unstructured output). Raw response:\n\n${raw.slice(0, 600)}`;
  }

  // Persist to brand_deals
  await db.from("brand_deals").insert({
    user_id: ctx.userId,
    status: analysis.verdict === "walk_away" ? "declined" : "reviewed",
    verdict: analysis.verdict,
    brand_name: analysis.brand_name,
    contact: analysis.contact,
    offer_text,
    offer_amount_cents: analysis.offer_amount_cents,
    currency: analysis.currency,
    deliverables: analysis.deliverables ?? {},
    deadlines: analysis.deadlines ?? {},
    exclusivity: analysis.exclusivity,
    usage_rights: analysis.usage_rights,
    red_flags: analysis.red_flags ?? [],
    green_flags: analysis.green_flags ?? [],
    ai_summary: analysis.summary_markdown,
    ai_recommended_response: analysis.recommended_response,
  });

  // Compose the chat-facing response
  return `${analysis.summary_markdown}

---

### 📨 Recommended response (in your voice)

${analysis.recommended_response}

---

Saved to **/app/brand-deals** — you can edit, reply, or mark it accepted/declined there.`;
}
