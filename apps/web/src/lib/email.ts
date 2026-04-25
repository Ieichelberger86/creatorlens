import { Resend } from "resend";

let _resend: Resend | null = null;
export function resend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required");
  _resend = new Resend(key);
  return _resend;
}

export const FROM = "Lens <lens@noreply.addaipro.fit>";
export const REPLY_TO = "ian@iepropertymgmt.com";

/**
 * Branded HTML shell — keeps every CreatorLens email visually consistent.
 * Inlined CSS because most email clients strip <style> tags.
 */
export function emailShell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0A0A0B;color:#FAFAFA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#0A0A0B;">${escape(
      opts.preheader
    )}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111113;border:1px solid #1F1F23;border-radius:14px;">
          <tr><td style="padding:24px 28px 12px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#8B5CF6;width:24px;height:24px;border-radius:6px;"></td>
                <td style="padding-left:10px;font-weight:600;font-size:15px;letter-spacing:-0.01em;color:#FAFAFA;">CreatorLens</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:8px 28px 0 28px;">
            <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#FAFAFA;">${escape(
              opts.heading
            )}</h1>
            <div style="font-size:15px;line-height:1.55;color:#E4E4E7;">
              ${opts.bodyHtml}
            </div>
            ${
              opts.ctaUrl && opts.ctaLabel
                ? `<div style="margin-top:24px;"><a href="${escape(
                    opts.ctaUrl
                  )}" style="display:inline-block;background:#8B5CF6;color:#FAFAFA;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;">${escape(
                    opts.ctaLabel
                  )}</a></div>`
                : ""
            }
            <hr style="border:none;border-top:1px solid #1F1F23;margin:28px 0 0 0;"/>
            <p style="margin:18px 0 4px 0;font-size:11px;color:#71717A;">
              CreatorLens · Vanguard alpha
            </p>
            <p style="margin:0 0 24px 0;font-size:11px;color:#52525B;">
              <a href="https://creatorlens.app/app" style="color:#8B5CF6;text-decoration:none;">Open Lens</a> ·
              <a href="mailto:ian@iepropertymgmt.com" style="color:#71717A;text-decoration:none;">ian@iepropertymgmt.com</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
