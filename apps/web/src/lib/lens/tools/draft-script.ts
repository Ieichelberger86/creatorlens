import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, LENS_MODEL } from "../client.js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const draftScriptTool: Anthropic.Tool = {
  name: "draft_script",
  description:
    "Write a TikTok script in the creator's voice given a hook + target duration. Pulls voice samples + niche + recent winning hooks from creator_profile so the script lands in their cadence. Use right after a creator picks a hook from generate_hooks, or when they describe a video idea and want it written out.",
  input_schema: {
    type: "object",
    properties: {
      hook: {
        type: "string",
        description: "The opening line — first 2 seconds of screen time. Required.",
      },
      duration_sec: {
        type: "integer",
        description:
          "Target video duration in seconds. Default 30. Common values: 15, 30, 45, 60.",
        minimum: 10,
        maximum: 180,
      },
      angle: {
        type: "string",
        description:
          "Optional creative angle or premise the script should explore (e.g. 'contrarian take on DSCR loans being riskier than W-2 mortgages').",
      },
      voice_override: {
        type: "string",
        description:
          "Optional: paste 1-3 sample lines from the creator if you want the script to mimic that specific style this time. Otherwise we use voice samples from their profile.",
      },
    },
    required: ["hook"],
  },
};

export async function draftScriptExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { hook, duration_sec, angle, voice_override } = input as {
    hook: string;
    duration_sec?: number;
    angle?: string;
    voice_override?: string;
  };

  const target = Math.min(Math.max(duration_sec ?? 30, 10), 180);

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche, voice_samples, top_videos, brand_notes")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const niche = profile?.niche ?? null;
  const voiceFromProfile = ((profile?.voice_samples as string[] | null) ?? []).slice(0, 5);
  const topVideos = (profile?.top_videos as Array<{ caption?: string }> | null) ?? [];
  const winningHooks = topVideos
    .map((v) => v.caption)
    .filter((c): c is string => !!c)
    .slice(0, 3);

  const voiceContext = [
    voice_override ? `Voice samples (use these for tone):\n${voice_override}` : null,
    voiceFromProfile.length
      ? `Saved voice samples:\n${voiceFromProfile.map((v) => `• ${v}`).join("\n")}`
      : null,
    winningHooks.length
      ? `Their actual top-performing video captions (real cadence):\n${winningHooks.map((c) => `• ${c}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await anthropic().messages.create({
    model: LENS_MODEL,
    max_tokens: 1500,
    system: `You write TikTok scripts that land. Output a single complete script in this exact format:

HOOK (0–2s)
<verbatim hook>

BODY (2s–${target - 3}s)
[<delivery cue>] <line>
[<delivery cue>] <line>
...

CTA (${target - 3}s–${target}s)
[<delivery cue>] <line>

B-ROLL / VISUAL CUES
- <one cue per line, references body lines>

NOTES
<2-3 short bullets on why this works for their voice>

Constraints:
- Every spoken line written exactly as the creator should say it. Contractions, fragments, casual punctuation OK.
- Match the creator's cadence from the voice samples below — sentence length, vocabulary, energy.
- Total spoken word count: ~${Math.round(target * 2.3)}–${Math.round(target * 2.8)} words (average TikTok delivery: ~2.5 wps).
- One specific number, name, or proof point in the body. No vague claims.
- CTA never says "follow for more". It asks something or names a specific next thing they'll get.
- Visual cues are concrete actions — "cut to phone screen showing approval text", not "show something interesting".

No preamble, no explanation, no caveats. Just output the script in the format above.`,
    messages: [
      {
        role: "user",
        content: `Niche: ${niche ?? "(not set)"}
Brand notes: ${profile?.brand_notes ?? "(none)"}

${voiceContext || "(No voice samples yet — write in a warm, direct, creator-native tone.)"}

Angle: ${angle ?? "(creator's choice — write whatever lands the hook best)"}
Target duration: ${target}s

Hook to write the script around:
"${hook}"`,
      },
    ],
  });

  return (
    res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "(script generation came back empty — try a more specific hook)"
  );
}
