import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resend, FROM, REPLY_TO, emailShell } from "@/lib/email";
import { isAuthorizedCron, alertCronFailure } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Perf = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  posted_at?: string | null;
  caption?: string | null;
};

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return await runDigest();
  } catch (err) {
    await alertCronFailure({ job: "digest", error: err });
    return NextResponse.json(
      {
        error: "digest_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function runDigest(): Promise<Response> {
  const admin = supabaseAdmin();

  // All Vanguard + admin users (no preorders, no churned)
  const { data: users } = await admin
    .from("users")
    .select("id, email, tier, tiktok_handle, display_name")
    .in("tier", ["vanguard", "admin"]);

  const results: Array<{ email: string; status: string; reason?: string }> = [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const u of users ?? []) {
    try {
      // Last week's posted videos
      const { data: vids } = await admin
        .from("videos")
        .select("tiktok_url, performance, analyzed_at")
        .eq("user_id", u.id)
        .eq("is_own", true)
        .order("analyzed_at", { ascending: false })
        .limit(50);

      const own = (vids ?? []).filter((v) => v.performance);
      const lastWeek = own.filter((v) => {
        const p = v.performance as Perf;
        const t = p?.posted_at ? Date.parse(p.posted_at) : 0;
        return t >= Date.parse(since);
      });

      // Baseline: median across all available
      const allViews = own
        .map((v) => (v.performance as Perf)?.views ?? 0)
        .filter((n): n is number => typeof n === "number" && n > 0);
      const median = allViews.length
        ? [...allViews].sort((a, b) => a - b)[Math.floor(allViews.length / 2)]!
        : 0;

      // Upcoming + idea calendar entries
      const { data: cal } = await admin
        .from("content_calendar")
        .select("title, hook, status, scheduled_for")
        .eq("user_id", u.id)
        .in("status", ["idea", "scheduled", "drafting", "shooting", "edited"])
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(8);

      // Build email body
      const totalViewsLW = lastWeek.reduce(
        (s, v) => s + ((v.performance as Perf)?.views ?? 0),
        0
      );
      const topLW = [...lastWeek].sort(
        (a, b) =>
          ((b.performance as Perf)?.views ?? 0) -
          ((a.performance as Perf)?.views ?? 0)
      )[0];
      const topViews = (topLW?.performance as Perf | undefined)?.views ?? 0;
      const vsMedian = median ? topViews / median : 0;

      const headline =
        lastWeek.length === 0
          ? "Quiet week — let's break the silence."
          : topLW && vsMedian >= 1.5
            ? `Big week. Top hit ${fmtBig(topViews)} (${vsMedian.toFixed(1)}× your median).`
            : `${lastWeek.length} post${lastWeek.length === 1 ? "" : "s"}, ${fmtBig(totalViewsLW)} total views.`;

      const lastWeekHtml = lastWeek.length
        ? `<p style="margin:0 0 8px 0;color:#A1A1AA;font-size:13px;text-transform:uppercase;letter-spacing:.04em;">Last week</p>
           <ul style="padding-left:18px;margin:0 0 24px 0;">${lastWeek
             .map((v) => {
               const p = v.performance as Perf;
               return `<li style="margin-bottom:6px;"><a href="${v.tiktok_url}" style="color:#FAFAFA;text-decoration:none;">${escape(
                 (p?.caption ?? "(no caption)").slice(0, 80)
               )}</a> · <span style="color:#A1A1AA;">${fmtBig(p?.views ?? 0)} views</span></li>`;
             })
             .join("")}</ul>`
        : `<p style="margin:0 0 24px 0;color:#A1A1AA;">No new videos since last digest. Everything starts with shipping one — what's the easiest one to record this week?</p>`;

      const calHtml =
        cal && cal.length
          ? `<p style="margin:0 0 8px 0;color:#A1A1AA;font-size:13px;text-transform:uppercase;letter-spacing:.04em;">On deck</p>
             <ul style="padding-left:18px;margin:0 0 24px 0;">${cal
               .map(
                 (c) =>
                   `<li style="margin-bottom:6px;"><strong>${escape(c.title)}</strong>${c.scheduled_for ? ` · <span style="color:#A1A1AA;">${new Date(c.scheduled_for).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>` : ""}${c.hook ? `<br/><span style="color:#A1A1AA;">"${escape(c.hook.slice(0, 100))}"</span>` : ""}</li>`
               )
               .join("")}</ul>`
          : `<p style="margin:0 0 24px 0;color:#A1A1AA;">Calendar's empty. Drop me a niche-relevant idea in chat and I'll script it.</p>`;

      const body = `
        ${lastWeekHtml}
        ${calHtml}
        <p style="margin:0 0 8px 0;font-size:14px;color:#FAFAFA;"><strong>Move I'd make this week:</strong></p>
        <p style="margin:0 0 8px 0;color:#E4E4E7;">${
          topLW && vsMedian >= 1.5
            ? `Run a follow-up to your ${fmtBig(topViews)}-view hit. Different angle, same audience — momentum compounds when you stack two related videos within a week.`
            : `Pick one idea from your calendar. Shoot it tomorrow morning. Don't overthink it.`
        }</p>
      `;

      const html = emailShell({
        preheader: headline,
        heading: headline,
        bodyHtml: body,
        ctaUrl: "https://creatorlens.app/app",
        ctaLabel: "Open Lens",
      });

      await resend().emails.send({
        from: FROM,
        to: u.email,
        subject: `Lens · ${headline}`,
        replyTo: REPLY_TO,
        html,
      });

      results.push({ email: u.email, status: "sent" });
    } catch (err) {
      results.push({
        email: u.email,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}

function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
