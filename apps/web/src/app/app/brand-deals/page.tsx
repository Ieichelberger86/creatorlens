import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BrandDealsClient, type BrandDealRow } from "./brand-deals-client";

export const metadata: Metadata = {
  title: "Brand deals",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function BrandDealsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("brand_deals")
    .select(
      "id, status, verdict, brand_name, contact, offer_text, offer_amount_cents, currency, deliverables, deadlines, exclusivity, usage_rights, red_flags, green_flags, ai_summary, ai_recommended_response, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <BrandDealsClient
      initial={(data ?? []) as BrandDealRow[]}
      loadError={error?.message ?? null}
    />
  );
}
