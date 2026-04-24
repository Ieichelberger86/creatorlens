import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const ADMIN_REALM = 'Basic realm="CreatorLens Admin"';

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": ADMIN_REALM },
  });
}

function protectAdmin(req: NextRequest) {
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
  return null;
}

async function protectApp(req: NextRequest, res: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  type CookieItem = { name: string; value: string; options?: CookieOptions };

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(items: CookieItem[]) {
        for (const c of items) {
          res.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    const target = new URL("/login", req.url);
    target.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(target);
  }

  // tier check via service-role is done at page level — middleware runs in Edge
  // and we avoid importing the full admin client. Page layout will re-check.
  return null;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const res = NextResponse.next();

  if (path.startsWith("/admin")) {
    const blocked = protectAdmin(req);
    if (blocked) return blocked;
    return res;
  }

  if (path.startsWith("/app")) {
    const blocked = await protectApp(req, res);
    if (blocked) return blocked;
    return res;
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/app/:path*"],
};
