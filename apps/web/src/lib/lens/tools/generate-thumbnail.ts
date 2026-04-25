import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fluxGenerate } from "../replicate.js";
import { anthropic, LENS_MODEL } from "../client.js";

export const generateThumbnailTool: Anthropic.Tool = {
  name: "generate_thumbnail",
  description:
    "Generate a TikTok thumbnail concept image for a given hook. Uses Flux 1.1 Pro — best-in-class for text-on-image. Default aspect 9:16 (vertical). Use when the creator says they want a thumbnail, cover image, or wants to see what a video could look like before shooting. Slow — 5-10 seconds — narrate while waiting.",
  input_schema: {
    type: "object",
    properties: {
      hook: {
        type: "string",
        description:
          "The hook or core line that should appear on the thumbnail. Required.",
      },
      vibe: {
        type: "string",
        description:
          "Optional aesthetic direction: 'minimalist with bold typography', 'documentary photo with text overlay', 'cinematic close-up', 'flat illustration', etc. If omitted, Lens picks a creator-native default.",
      },
      aspect_ratio: {
        type: "string",
        enum: ["9:16", "1:1", "16:9"],
        description: "9:16 for TikTok (default). 1:1 for IG/grid. 16:9 for YouTube.",
      },
    },
    required: ["hook"],
  },
};

export async function generateThumbnailExecutor(
  input: Record<string, unknown>,
  ctx: { userId: string }
): Promise<string> {
  const { hook, vibe, aspect_ratio } = input as {
    hook: string;
    vibe?: string;
    aspect_ratio?: "9:16" | "1:1" | "16:9";
  };

  const aspect = aspect_ratio ?? "9:16";

  // Pull the creator's niche to ground the thumbnail aesthetic
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("creator_profile")
    .select("niche")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const niche = profile?.niche ?? "creator content";

  // Compose a high-quality Flux prompt. Flux 1.1 Pro renders text well when
  // the prompt makes the text element explicit and quoted.
  const styleDirective =
    vibe ??
    "high-contrast, scroll-stopping editorial photography with bold sans-serif typography overlay; modern, cinematic, slight grain";

  const prompt = `TikTok thumbnail for a ${niche} creator. Composition: vertical 9:16 portrait, dramatic lighting, eye-level focus.
Big readable headline text overlay reading exactly: "${hook}".
The text is in a heavy bold sans-serif font, white with a subtle shadow, top third or bottom third of the frame, never blocking the subject's face.
Style: ${styleDirective}.
No watermarks, no logos, no platform UI, no captions, no extra small text.`;

  let imageUrl: string | null;
  try {
    imageUrl = await fluxGenerate({ prompt, aspect_ratio: aspect });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Couldn't generate the thumbnail (${msg}). Try a simpler hook or a different aspect ratio.`;
  }

  if (!imageUrl) {
    return "Thumbnail generation came back empty — Flux didn't return an image. Try again or rephrase the hook.";
  }

  // Persist to Supabase Storage so the URL doesn't expire in 24 hours
  let permanentUrl = imageUrl;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      const path = `${ctx.userId}/${Date.now()}-${randomSuffix()}.webp`;
      const { error: uploadErr } = await db.storage
        .from("thumbnails")
        .upload(path, buf, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
      if (!uploadErr) {
        const { data: pub } = db.storage.from("thumbnails").getPublicUrl(path);
        if (pub?.publicUrl) permanentUrl = pub.publicUrl;
      }
    }
  } catch {
    // Fall back to the Replicate URL — works for ~24h
  }

  // Optional: short caption from Claude describing the design choice. Keeps
  // Lens from defaulting to a generic "here's your thumbnail!" reply.
  let caption = "";
  try {
    const captionRes = await anthropic().messages.create({
      model: LENS_MODEL,
      max_tokens: 80,
      system:
        "You are Lens. Output one warm, direct sentence (under 25 words) that hands off a thumbnail concept to the creator and invites tweaks. No preamble, no exclamations, no quotes around the hook.",
      messages: [
        {
          role: "user",
          content: `Hook: ${hook}\nVibe: ${styleDirective}\nWrite the handoff sentence.`,
        },
      ],
    });
    caption = captionRes.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    caption = "Here's a starting point — want me to push it harder, swap the vibe, or try a different angle?";
  }

  return `${caption}\n\n![Thumbnail concept for "${hook.slice(0, 60)}"](${permanentUrl})`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
