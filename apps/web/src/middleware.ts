import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_REALM = 'Basic realm="CreatorLens Admin"';

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": ADMIN_REALM },
  });
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse("ADMIN_PASSWORD not configured", { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return unauthorized();

  const decoded = atob(auth.slice("Basic ".length));
  const colonIdx = decoded.indexOf(":");
  const given = colonIdx === -1 ? decoded : decoded.slice(colonIdx + 1);

  if (given !== password) return unauthorized();
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
