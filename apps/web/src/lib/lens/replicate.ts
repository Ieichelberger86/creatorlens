import Replicate from "replicate";

let _client: Replicate | null = null;

export function replicate(): Replicate {
  if (_client) return _client;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is required");
  _client = new Replicate({ auth: token });
  return _client;
}

/**
 * Run Flux 1.1 Pro for a TikTok thumbnail. Returns the raw output URL
 * from Replicate (24h-expiring). Caller is responsible for persisting it.
 */
export async function fluxGenerate(args: {
  prompt: string;
  aspect_ratio?: "9:16" | "1:1" | "16:9";
  safety?: "block" | "default";
}): Promise<string | null> {
  const client = replicate();
  const aspect = args.aspect_ratio ?? "9:16";

  const output = await client.run("black-forest-labs/flux-1.1-pro", {
    input: {
      prompt: args.prompt,
      aspect_ratio: aspect,
      output_format: "webp",
      output_quality: 90,
      safety_tolerance: args.safety === "block" ? 2 : 5,
      prompt_upsampling: true,
    },
  });

  // Replicate's run() returns either a URL string, an array of URL strings,
  // or a ReadableStream depending on the model. Handle all three.
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    return typeof first === "string" ? first : null;
  }
  // FileOutput (newer Replicate SDK) — has a .url() method
  if (output && typeof output === "object" && "url" in output) {
    const u = (output as { url: () => URL | string }).url();
    return typeof u === "string" ? u : u.toString();
  }
  return null;
}
