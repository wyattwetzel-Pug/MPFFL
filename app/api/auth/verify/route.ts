import { NextRequest, NextResponse } from "next/server";
import { normalizeLoginToken } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

/*
 * Kept so links already sent out keep working. It no longer signs anyone in:
 * a GET must stay safe, because link previewers and mail scanners fetch every
 * URL they encounter and would otherwise spend the token before the recipient
 * opened it. Hand off to the confirmation page, which consumes it on POST.
 */
export async function GET(req: NextRequest) {
  const token = normalizeLoginToken(req.nextUrl.searchParams.get("token") ?? "");
  const dest = safeNext(req.nextUrl.searchParams.get("next"));
  const target = token
    ? `/sign-in/verify?token=${encodeURIComponent(token)}` +
      (dest ? `&next=${encodeURIComponent(dest)}` : "")
    : "/sign-in?error=invalid";
  return NextResponse.redirect(new URL(target, req.nextUrl.origin));
}
