import { supabaseAdmin } from "@/lib/supabase/admin";

export async function loadProfileSummary(userId: string): Promise<string> {
  const db = supabaseAdmin();

  const [{ data: user }, { data: profile }, { data: recentVideos }] =
    await Promise.all([
      db.from("users").select("display_name, tiktok_handle, email").eq("id", userId).maybeSingle(),
      db
        .from("creator_profile")
        .select("niche, voice_samples, top_videos, competitors, brand_notes, goals, onboarded_at")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("videos")
        .select("tiktok_url, is_own, transcript, performance, analyzed_at")
        .eq("user_id", userId)
        .order("analyzed_at", { ascending: false, nullsFirst: false })
        .limit(10),
    ]);

  if (!profile?.onboarded_at && !profile?.niche) {
    return "(empty — first conversation, start the onboarding flow)";
  }

  const parts: string[] = [];
  if (user?.display_name) parts.push(`Name: ${user.display_name}`);
  if (user?.tiktok_handle) parts.push(`TikTok: @${user.tiktok_handle}`);
  if (profile?.niche) parts.push(`Niche: ${profile.niche}`);

  const goals = (profile?.goals as Record<string, unknown>) ?? {};
  if (Object.keys(goals).length) {
    parts.push(`Goals: ${JSON.stringify(goals)}`);
  }

  if (profile?.brand_notes) parts.push(`Brand notes: ${profile.brand_notes}`);

  const voice = (profile?.voice_samples as string[] | null) ?? [];
  if (voice.length) {
    parts.push(`Voice samples (${voice.length}):`);
    voice.slice(0, 5).forEach((v) => parts.push(`  - ${v.slice(0, 200)}`));
  }

  const competitors = (profile?.competitors as Array<{ handle: string }> | null) ?? [];
  if (competitors.length) {
    parts.push(
      `Competitors being watched: ${competitors.map((c) => c.handle).join(", ")}`
    );
  }

  if (recentVideos && recentVideos.length > 0) {
    parts.push(`Recent videos analyzed (${recentVideos.length}):`);
    recentVideos.slice(0, 5).forEach((v) => {
      const perf = v.performance ? JSON.stringify(v.performance) : "no stats";
      parts.push(`  - ${v.is_own ? "OWN" : "ref"} ${v.tiktok_url} — ${perf}`);
    });
  }

  return parts.length ? parts.join("\n") : "(empty)";
}
