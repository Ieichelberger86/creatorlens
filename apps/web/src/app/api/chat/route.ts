import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chat is gone. Lens runs on a weekly cadence now — see /app for the
 * latest review and /app/review for history.
 */
export function POST() {
  return NextResponse.json(
    {
      error: "chat_removed",
      message:
        "Open chat has been replaced by structured weekly reviews. Visit /app for your latest review.",
    },
    { status: 410 }
  );
}

export function GET() {
  return NextResponse.json(
    { error: "chat_removed", message: "POST removed; product runs on weekly reviews." },
    { status: 410 }
  );
}
