// Seeds the demo account that powers /demo.
//
// Usage from apps/web:  set -a; source .env.local; set +a; node --import tsx seed-demo.mts
//
// Idempotent. Safe to re-run — wipes the demo user's data each time and
// re-seeds with realistic numbers.

import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@creatorlens.app";
const DEMO_HANDLE = "creatorlens.demo";

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  console.log("== Seeding demo account ==\n");

  // 1. Find or create the auth user
  let userId: string | null = null;
  const { data: existingUser } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const found = existingUser.users.find((u) => u.email === DEMO_EMAIL);
  if (found) {
    userId = found.id;
    console.log(`Found existing demo user: ${userId}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: DEMO_EMAIL,
      email_confirm: true, // bypass email verification
      user_metadata: { demo: true },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created demo user: ${userId}`);
  }

  // 2. Wipe existing demo data so we re-seed cleanly
  console.log("\nWiping demo data…");
  for (const [name, op] of [
    ["conversations", db.from("conversations").delete().eq("user_id", userId)],
    ["videos", db.from("videos").delete().eq("user_id", userId)],
    ["content_calendar", db.from("content_calendar").delete().eq("user_id", userId)],
    ["brand_deals", db.from("brand_deals").delete().eq("user_id", userId)],
    ["live_shows", db.from("live_shows").delete().eq("user_id", userId)],
    ["goals", db.from("goals").delete().eq("user_id", userId)],
    ["competitor_watch", db.from("competitor_watch").delete().eq("user_id", userId)],
    ["pending_lens_messages", db.from("pending_lens_messages").delete().eq("user_id", userId)],
    ["creator_profile", db.from("creator_profile").delete().eq("user_id", userId)],
    ["tool_runs", db.from("tool_runs").delete().eq("user_id", userId)],
  ] as const) {
    const { error } = await op;
    console.log(`  ${name}: ${error ? "FAIL " + error.message : "wiped"}`);
  }

  // 3. Set users row: vanguard tier, low cap, demo flags
  await db.from("users").update({
    tier: "vanguard",
    vanguard_creator: true,
    tiktok_handle: DEMO_HANDLE,
    display_name: "@creatorlens.demo",
    monthly_token_cap: 20_000, // low — demo can't burn budget
    monthly_tokens_used: 0,
    monthly_period_start: new Date().toISOString(),
  }).eq("id", userId);
  console.log("\nUsers row: tier=vanguard, cap=20K");

  // 4. Creator profile (onboarded, voice samples)
  await db.from("creator_profile").insert({
    user_id: userId,
    niche: "real estate investor making content for first-time buyers who feel priced out",
    voice_samples: [
      "you don't need 100k saved — here's how I bought my first deal with $5k",
      "the bank told me no. then I called the right lender. then I bought the house.",
      "save this if you're thinking about your first investment property in 2026",
    ],
    monetization_streams: ["lead_gen", "brand_deals", "info_product"],
    brand_notes:
      "Voice traits: confident, contrarian, speaks in numbers, no-fluff. Avoids: get-rich-quick framing, Wall Street jargon.",
    goals: { ninety_day: "Hit 25K followers and land 2 paid brand deals over $1k" },
    onboarded_at: new Date().toISOString(),
    top_videos: [
      {
        url: "https://www.tiktok.com/@creatorlens.demo/video/1",
        views: 142_000,
        likes: 12_400,
        caption: "5 things first-time investors get wrong",
        hashtags: ["realestate", "investing", "firstdeal"],
      },
      {
        url: "https://www.tiktok.com/@creatorlens.demo/video/2",
        views: 87_000,
        likes: 6_200,
        caption: "I bought a house with $5k. Here's exactly how.",
        hashtags: ["realestate", "fha", "househack"],
      },
    ],
  });
  console.log("Creator profile seeded");

  // 5. Goals
  const ninetyDays = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await db.from("goals").insert([
    {
      user_id: userId,
      title: "Hit 25K followers",
      kind: "followers",
      baseline_value: 12_400,
      current_value: 14_800,
      target_value: 25_000,
      target_unit: "followers",
      target_date: ninetyDays,
      baseline_captured_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      current_updated_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      status: "active",
      why_it_matters:
        "First-deal-investor brand deals require a 25K minimum from agencies like Realtor.com and Mynd. Hitting this unlocks the next monetization tier.",
      action_plan: `## Week 1
- **Lean into the "first deal" series.** The 142K-view video is the highest-leverage pattern — film 3 follow-ups this week with the same hook structure.
- **Pin the breakout to your profile.** Use it as the entry point for new visitors so they convert at >2%.

## Weeks 2-4
- Stitch one viral comp video per week — borrow attention while keeping your voice.
- Test 2 hooks per week against the breakout pattern.

## Weeks 5-8
- Lock the working format. Aim for 2 posts per week + 1 stitch.
- Start the "first deal under $200K" series (hooks already drafted in your calendar).

## Weeks 9-12
- Fly past 25K with a final push: collab with one creator in your niche, plus a live Q&A.`,
      milestones: [
        { title: "Hit 17.5K (50% mark)", target_date: thirtyDaysFromNow },
        { title: "Hit 21K (mid-point)", target_date: sixtyDaysFromNow },
        { title: "Hit 25K", target_date: ninetyDays },
      ],
      source: "onboarding_audit",
    },
    {
      user_id: userId,
      title: "Land 2 paid brand deals over $1K each",
      kind: "monetization",
      baseline_value: 0,
      current_value: 0,
      target_value: 2,
      target_unit: "brand deals",
      target_date: ninetyDays,
      baseline_captured_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      current_updated_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      status: "active",
      why_it_matters:
        "$2-3K/month in brand deals replaces the day job at 6 deals/year and lets you go full-time on content.",
      action_plan: `## Week 1
- **Reach out to 5 brands** from your warm-DM template list. Lead with the 142K video as the proof case.
- **Update your bio** to include a brand-deal CTA: "DM for partnerships."

## Weeks 2-4
- 5 outreach DMs per week. Track replies in your Brand deals tab.
- Negotiate every deal that comes in — don't accept the first offer.

## Weeks 5-8
- Land the first deal. Deliver above expectation to set up a repeat.
- Pitch a 3-month retainer to anyone who pays once.

## Weeks 9-12
- Land the second deal. Use the first deal as the case study.`,
      milestones: [
        { title: "5 outbound DMs sent", target_date: thirtyDaysFromNow },
        { title: "First deal closed", target_date: sixtyDaysFromNow },
        { title: "Second deal closed", target_date: ninetyDays },
      ],
      source: "onboarding_audit",
    },
  ]);
  console.log("Goals seeded (2)");

  // 6. Content calendar (mix of upcoming + past + ideas)
  const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  await db.from("content_calendar").insert([
    {
      user_id: userId,
      title: "5 things first-time investors get wrong",
      hook: "Most people lose their first deal before they even sign anything.",
      script: "## HOOK\nMost people lose their first deal before they even sign anything.\n\n## BODY\n1. They wait for the perfect property.\n2. They get pre-approved at the wrong bank.\n3. They underwrite emotionally instead of mathematically.\n4. They skip the inspection to save $400.\n5. They forget closing costs are 3-4% on top of the down payment.\n\n## CTA\nSave this for the next time you're house-hunting.",
      status: "scheduled",
      scheduled_for: days(2),
    },
    {
      user_id: userId,
      title: "Stitch viral comp video — film + post",
      hook: "Wait, that's actually wrong. Here's what happens to investors who do that…",
      status: "scheduled",
      scheduled_for: days(3),
    },
    {
      user_id: userId,
      title: "Brand pitch reply: Realtor.com",
      status: "drafting",
      scheduled_for: days(4),
      notes: "$2.5K/post, 3-post deal. Negotiate up to $3K.",
    },
    {
      user_id: userId,
      title: "How I underwrite a deal in 90 seconds",
      hook: "I bought my first house in 2 weeks. Here's the math I run before I even tour it.",
      status: "idea",
    },
    {
      user_id: userId,
      title: "FHA loan myths I had to unlearn",
      status: "idea",
    },
    {
      user_id: userId,
      title: "I bought a house with $5k. Here's exactly how.",
      status: "posted",
      posted_at: days(-3),
      posted_url: "https://www.tiktok.com/@creatorlens.demo/video/2",
    },
    {
      user_id: userId,
      title: "5 things first-time investors get wrong",
      status: "posted",
      posted_at: days(-1),
      posted_url: "https://www.tiktok.com/@creatorlens.demo/video/1",
    },
  ]);
  console.log("Calendar seeded (7 entries)");

  // 7. Brand deals
  await db.from("brand_deals").insert([
    {
      user_id: userId,
      status: "reviewed",
      verdict: "negotiate",
      brand_name: "Realtor.com",
      contact: "partnerships@realtor.com",
      offer_text: "Hi, we'd love to partner on 3 short-form videos for our first-time-buyer campaign. Budget is $1500 total. 30-day exclusivity in real-estate-tech.",
      offer_amount_cents: 150_000,
      currency: "USD",
      deliverables: ["3 TikToks, 30-60s each, posted within 30 days"],
      exclusivity: "30 days, real-estate-tech category",
      ai_summary:
        "Legit brand. Offer is below the 142K-view performance — counter to $2.5-3K total ($800-1K/post) given audience size and engagement rates. Exclusivity is reasonable.",
      ai_recommended_response:
        "Hey [contact name], thanks — your campaign aligns with my audience perfectly. For 3 videos with 30-day category exclusivity, I'd want to be at $2,500 total based on my recent deals at this audience size. Happy to lock in if that works on your end.",
      red_flags: [],
      green_flags: ["Real brand", "Clear deliverables", "Reasonable exclusivity"],
    },
  ]);
  console.log("Brand deals seeded (1)");

  // 8. Live shows
  await db.from("live_shows").insert([
    {
      user_id: userId,
      status: "ended",
      scheduled_for: days(-7),
      ended_at: days(-7),
      duration_min: 60,
      duration_target_min: 60,
      focus_topic: "Q&A: first investment property under $200K",
      peak_viewers: 142,
      total_unique_viewers: 380,
      diamonds: 4500,
      ai_recap: "## Verdict: First recorded show clocked 4,500 diamonds/hour.\n\n### What worked\n- Peak of 142 viewers is strong for a debut\n- The deal walkthrough segment drove diamond bursts\n\n### What didn't\n- Q&A early in the show didn't sustain attention\n\n### What to change next show\n- Lead with the deal walkthrough, save Q&A for the back half",
    },
  ]);
  console.log("Live shows seeded (1)");

  // 9. Videos (for insights stats)
  const videos = [
    { url: "https://www.tiktok.com/@creatorlens.demo/video/1", views: 142_000, likes: 12_400, posted: -1 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/2", views: 87_000, likes: 6_200, posted: -3 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/3", views: 21_000, likes: 1_400, posted: -7 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/4", views: 35_500, likes: 2_100, posted: -10 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/5", views: 18_200, likes: 980, posted: -14 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/6", views: 24_300, likes: 1_650, posted: -18 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/7", views: 12_800, likes: 720, posted: -23 },
    { url: "https://www.tiktok.com/@creatorlens.demo/video/8", views: 28_900, likes: 1_870, posted: -28 },
  ];
  await db.from("videos").upsert(
    videos.map((v) => ({
      user_id: userId,
      tiktok_url: v.url,
      tiktok_id: v.url.split("/").pop()!,
      is_own: true,
      transcript:
        "Most people lose their first deal before they even sign anything. They wait for the perfect property. They get pre-approved at the wrong bank. They underwrite emotionally instead of mathematically.",
      performance: {
        views: v.views,
        likes: v.likes,
        comments: Math.round(v.likes * 0.04),
        shares: Math.round(v.likes * 0.06),
        saves: Math.round(v.likes * 0.18),
        posted_at: days(v.posted),
        author: "creatorlens.demo",
        hashtags: ["realestate", "investing", "firstdeal"],
        caption: "first-time investor mistakes that cost you the deal",
        duration_sec: 28,
      },
      analyzed_at: days(v.posted),
    })),
    { onConflict: "user_id,tiktok_url" }
  );
  console.log(`Videos seeded (${videos.length})`);

  // 10. Conversation: a fake audit message + a few back-and-forth turns
  const auditMessage = `# Your audit, @${DEMO_HANDLE}

**14.8K followers · 35K median views · 2.3 videos/week · 4.1% lifetime engagement.** You're a steady performer with one breakout.

## What's working

1. **First-deal stories with concrete numbers.** The "$5k house" video (87K views) and the "5 things first-time investors get wrong" video (142K) both lead with a specific dollar amount in the first 2 seconds. That pattern outperforms your hashtag-style hooks by ~3.4× median.
2. **Contrarian opens.** Lines like "Most people lose their first deal before they even sign anything" and "the bank told me no" pull retention through the first 5 seconds. Your top 3 videos all use this structure.
3. **Hashtag clustering.** #firstdeal alone averages 47K views per use across your account vs. #realestate at 18K. Lean into the long-tail tags.

## What's not working

1. **Hook length drift.** Videos longer than 35 seconds drop median views by 38%. Your top performers are all 25-30 seconds — anything past that is leaving views on the table.
2. **Inconsistent CTAs.** "Save this" gets 3.1× the saves of "follow for more." You use the latter on 6 of your last 10 posts.

## Your voice

Confident, contrarian, speaks in numbers. Three-beat sentence structure with a turn. Quote: *"the bank told me no. then I called the right lender. then I bought the house."* Lean into that cadence.

## 3 experiments this week

1. **"You don't need a 20% down payment to buy your first investment property — here's the math."** — 28s, "you'd think" structure, FHA payoff at the end.
2. **"My first deal lost money the first 6 months. Then this happened."** — 30s, contrarian arc, vindication payoff.
3. **"Realtor told me to wait. I bought anyway. Here's what happened in year 1."** — 25s, defiance opener, before/after numbers.

## Stop doing this

Your "5 ways to..." listicle hooks are dying. They average 60% of your median. The format is saturated in your niche — every second video on the FYP starts the same way. Drop them entirely.

---

I'm here when you're ready. Want me to script experiment #1, or something else first?

---

# Your 90-day goals

I've broken your 90-day vision into 2 measurable goals tied to your monetization streams (lead_gen, brand_deals, info_product):

**1. Hit 25K followers**
*Why it matters:* First-deal-investor brand deals require a 25K minimum.
*Baseline → target:* 12,400 → 25,000 followers by 90d

**2. Land 2 paid brand deals over $1K each**
*Why it matters:* Replaces day job at 6 deals/year, full-time content path.
*Target:* 2 brand deals by 90d

👉 Full action plans (week-by-week tactics) are saved at **/app/goals**. 2 goals locked in. Want to start working on goal #1 right now?`;

  await db.from("conversations").insert([
    {
      user_id: userId,
      channel: "web",
      title: "Profile audit + goals",
      messages: [
        {
          role: "assistant",
          content: auditMessage,
          created_at: days(-1),
        },
        {
          role: "user",
          content: "Yes — let's do experiment #1. Generate 10 hook variants for the FHA down payment hook.",
          created_at: days(-1),
        },
        {
          role: "assistant",
          content: `Here are 10 hook variants for the FHA down payment angle. Each opens with a number or contrarian claim and runs the "you don't need X" structure:

1. **"You don't need 20% down. You need 3.5% and the right lender."**
2. **"Everyone says save 20%. I bought my first house with 3.5%."**
3. **"The 20% down rule is a lie. Here's the math nobody runs."**
4. **"$10K is enough for your first investment property. Yes, in 2026."**
5. **"FHA, conventional, VA — pick the wrong one and you lose $30K."**
6. **"I had $7K in the bank. I still bought a house. Here's how."**
7. **"You're saving 20% for a down payment. The bank doesn't actually want that."**
8. **"Most first-time investors over-save by 4 years. Here's the loan they don't know about."**
9. **"3.5% down + house hack = your first investment property at 24."**
10. **"The down payment rule that's costing you 3 years of equity."**

Pick the one that feels most like you and I'll write the full 28-second script.`,
          created_at: days(-1),
        },
      ],
      last_message_at: days(-1),
    },
  ]);
  console.log("Conversation seeded (1 with audit + Q&A)");

  // 11. Pending nudges (so the dashboard "Lens has thoughts" section has data)
  await db.from("pending_lens_messages").insert([
    {
      user_id: userId,
      source: "competitor_watch",
      payload: {
        content: `**Heads up — @brokebrokerbri just had a breakout.**\n\n[**12.3× their median**](https://tiktok.com/@brokebrokerbri/video/123) (1.8M views in ~14h)\n\n> "I make $9k/month flipping houses with $0 of my own money. Here's how."\n\nWant me to write your version of this hook for your audience?`,
      },
    },
  ]);
  console.log("Pending nudges seeded (1)");

  console.log("\n== Done ==");
  console.log(`Demo user ID: ${userId}`);
  console.log(`Demo email:   ${DEMO_EMAIL}`);
  console.log(`Hit /demo to log in as this user.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
