import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/*
 * Nags the people who never went through the consent flow.
 *
 * Consent lives on a team page, and nothing ever pointed anyone at it — three
 * owners reached the eve of a draft having accepted nothing, and the only way
 * to find that out was to query the database.
 *
 * Deliberately not a gate. Two reasons: a new block in the sign-in path is the
 * worst possible place to ship an untested change the week the whole league
 * arrives, and SMS consent must stay freely given. The Privacy Policy and
 * Terms are fair to insist on; texts are an offer, and the copy keeps that
 * distinction rather than trading one for the other.
 */
export async function ConsentBanner() {
  const owner = await getSessionOwner();
  if (!owner) return null;

  // No point telling someone to go to the page they're already on — team
  // settings sits at the top of it.
  const path = (await headers()).get("x-pathname") ?? "";
  if (path.startsWith("/teams/")) return null;

  const me = await prisma.owner.findUnique({
    where: { id: owner.id },
    select: {
      privacyConsentAt: true,
      touConsentAt: true,
      smsConsentAt: true,
      teamOwner: { select: { team: { select: { slug: true } } } },
    },
  });
  if (!me) return null;

  const slug = me.teamOwner?.team.slug;
  if (!slug) return null;

  const needsTerms = !me.privacyConsentAt || !me.touConsentAt;
  const needsSms = !me.smsConsentAt;
  if (!needsTerms && !needsSms) return null;

  const settings = (
    <Link href={`/teams/${slug}`} className="font-medium underline underline-offset-4">
      your team page
    </Link>
  );

  // Terms outrank texts: one is required to use the site, the other is a choice.
  if (needsTerms) {
    const missing = [!me.privacyConsentAt && "Privacy Policy", !me.touConsentAt && "Terms of Use"]
      .filter(Boolean)
      .join(" and ");
    return (
      <Alert variant="warning" className="mb-4">
        <AlertTitle>Please accept the {missing}</AlertTitle>
        <AlertDescription>
          Tick the boxes at the top of {settings}.{" "}
          {needsSms
            ? "Takes a moment, and you can turn league texts on at the same time — the draft tells you by text when you're on the clock."
            : "Takes a moment."}
        </AlertDescription>
      </Alert>
    );
  }

  // Texts only: an offer, phrased as one.
  return (
    <p className="mb-4 text-sm text-muted-foreground">
      You&apos;re not signed up for league texts, so nothing will tell you when you&apos;re on
      the clock in the draft. Turn them on at the top of {settings} — optional, and you can
      stop them any time.
    </p>
  );
}
