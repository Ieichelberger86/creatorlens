/**
 * Vercel Cron jobs hit /api/cron/* with an Authorization: Bearer <CRON_SECRET>
 * header. This helper validates the request before doing any work.
 */
export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // If no secret is set, allow Vercel's own cron (it sends the user-agent
    // "vercel-cron/1.0") — defensive default so first-time setup doesn't
    // silently 401 every job.
    const ua = req.headers.get("user-agent") ?? "";
    return ua.includes("vercel-cron");
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7) === expected;
  }
  return false;
}
