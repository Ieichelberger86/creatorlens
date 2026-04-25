/**
 * JSON extraction helper for tools that ask Claude for structured output
 * via the text channel (rather than tool_use).
 *
 * Claude occasionally wraps JSON in ```json fences or includes literal
 * newlines inside string values. This helper:
 *   1. Strips ```json / ``` fences if present
 *   2. Finds the outermost {...} block
 *   3. Returns the candidate JSON string for JSON.parse
 *
 * Prefer Anthropic tool_use for new tools — it forces structured output at
 * the API level. This helper is for older tools that haven't been migrated.
 */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

/**
 * Try to parse Claude's text response as JSON. Returns null on failure
 * rather than throwing — callers decide how to surface the unstructured
 * fallback to the user.
 */
export function tryParseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(extractJsonText(raw)) as T;
  } catch {
    return null;
  }
}

/**
 * Strip markdown fences from a raw response so the cleaned text is
 * presentable to the user even if structured parsing failed.
 */
export function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
}
