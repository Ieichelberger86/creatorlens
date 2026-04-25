import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CalendarClient, type CalendarRow } from "./calendar-client";

export const metadata: Metadata = {
  title: "Calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("content_calendar")
    .select(
      "id, status, title, hook, script, notes, scheduled_for, posted_at, posted_url, created_at"
    )
    .eq("user_id", user.id)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <CalendarClient
      initial={(data ?? []) as CalendarRow[]}
      loadError={error?.message ?? null}
    />
  );
}
