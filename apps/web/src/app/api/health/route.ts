import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "creatorlens-web",
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
