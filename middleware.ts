import { NextResponse, type NextRequest } from "next/server";

/*
 * Puts the requested path into a header so server code can read it.
 *
 * Next gives a server component no way to know its own URL, which means
 * `requireOwner()` — the thing that bounces a signed-out owner to /sign-in —
 * had no idea where they were trying to go. Everyone landed on the home page
 * after signing in, however specific the link that sent them.
 *
 * This is the smallest mechanism that fixes it. It reads nothing and decides
 * nothing; it only carries the path forward.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only. API routes handle their own redirects, and static assets have
  // no use for this.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
