import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { prisma } from "@/lib/prisma";
import { getSessionOwner, hashToken, normalizeLoginToken } from "@/lib/auth";
import { confirmSignIn } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/*
 * Landing page for a sign-in link. Loading it changes nothing — the token is
 * only spent when the button below is pressed. That keeps link previewers and
 * mail scanners, which fetch every URL they see, from burning the link before
 * the person it was sent to ever opens it.
 */
export default async function VerifySignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token: rawToken, next } = await searchParams;
  const dest = safeNext(next);
  const token = normalizeLoginToken(rawToken ?? "");
  if (!token) redirect("/sign-in?error=invalid");

  if (await getSessionOwner()) redirect("/");

  const loginToken = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: { select: { name: true, email: true } } },
  });

  if (!loginToken) redirect("/sign-in?error=invalid");
  if (loginToken.usedAt) redirect("/sign-in?error=used");
  if (loginToken.expiresAt < new Date()) redirect("/sign-in?error=expired");

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl">Sign in to MPFFL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Continue as{" "}
            <span className="font-medium text-foreground">{loginToken.owner.name}</span>
            <br />
            <span className="text-xs">{loginToken.owner.email}</span>
          </p>
          <form action={confirmSignIn}>
            <input type="hidden" name="token" value={token} />
            {dest && <input type="hidden" name="next" value={dest} />}
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            You&apos;ll stay signed in on this device.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
