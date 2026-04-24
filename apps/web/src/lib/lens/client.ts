import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is required on the server");
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export const LENS_MODEL = process.env.LENS_MODEL ?? "claude-sonnet-4-6";
export const LENS_MAX_TOKENS = 2048;
