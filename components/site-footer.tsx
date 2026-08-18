import Link from "next/link";
import { getSessionOwner } from "@/lib/auth";

/*
 * The single site footer, ported from v1. Links for features not yet
 * rebuilt (Champions, Transactions, Manual, Privacy, TOU) return as
 * those pages ship. The AI Connector link is session-gated — the page it
 * leads to carries the league's connector secret.
 */
const FOOTER_LINKS: { title: string; href: string; external?: boolean }[] = [
  { title: "Home", href: "/" },
  { title: "Rosters", href: "/rosters" },
  { title: "Transactions", href: "/transactions" },
  { title: "Manual", href: "/manual" },
  { title: "ESPN", href: "https://fantasy.espn.com/football/league?leagueId=1865381540", external: true },
  { title: "Privacy", href: "/privacy" },
  { title: "Terms", href: "/tou" },
];

export async function SiteFooter() {
  const owner = await getSessionOwner();
  const links = owner
    ? FOOTER_LINKS.flatMap((l) =>
        l.title === "ESPN" ? [l, { title: "AI Connector", href: "/mcp" }] : [l]
      )
    : FOOTER_LINKS;
  return (
    <footer className="border-t bg-background/95">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-4 md:px-6 md:py-6">
        <div className="mb-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} MPFFL. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 text-sm font-medium md:gap-4">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                {link.title}
              </a>
            ) : (
              <Link
                key={link.title}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                {link.title}
              </Link>
            )
          )}
        </div>
      </div>
    </footer>
  );
}
