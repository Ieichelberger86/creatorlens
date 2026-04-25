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

/**
 * Email Ian when a cron job fails. Best-effort — never throws so cron
 * handlers can call without try/catch.
 *
 * Sends to ian@iepropertymgmt.com (the founder address). Subject prefix
 * makes inbox filtering easy.
 */
export async function alertCronFailure(args: {
  job: string;
  error: unknown;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { Resend } = await import("resend");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const r = new Resend(apiKey);
    const message =
      args.error instanceof Error
        ? `${args.error.name}: ${args.error.message}\n\n${args.error.stack ?? ""}`
        : String(args.error);

    await r.emails.send({
      from: "Lens Alerts <lens@noreply.addaipro.fit>",
      to: "ian@iepropertymgmt.com",
      subject: `[CreatorLens] Cron failure: ${args.job}`,
      html: `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:13px;line-height:1.5;color:#0f172a;background:#fff;padding:24px">
        <h2 style="margin:0 0 12px">Cron job failed: <code>${args.job}</code></h2>
        <p style="color:#64748b;margin:0 0 16px">Hit at ${new Date().toISOString()}</p>
        <h3 style="margin:16px 0 8px;font-size:13px">Error</h3>
        <pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word">${escapeHtml(message)}</pre>
        ${
          args.context
            ? `<h3 style="margin:16px 0 8px;font-size:13px">Context</h3>
        <pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word">${escapeHtml(JSON.stringify(args.context, null, 2))}</pre>`
            : ""
        }
      </div>`,
    });
  } catch {
    // Last-ditch — log to console.error and move on
    console.error(`[cron alert] Failed to send alert for ${args.job}:`, args.error);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
