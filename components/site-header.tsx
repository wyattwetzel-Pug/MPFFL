import { getSessionOwner } from "@/lib/auth";
import { HeaderClient } from "@/components/header-client";

/*
 * The single site header. Nav items live here and only here.
 * Items for v1 features we haven't rebuilt yet (Transactions, Auction,
 * Manual, Rules Vote) get added back as each feature ships.
 */
const NAV_ITEMS = [
  { title: "Rosters", href: "/rosters" },
  { title: "Rookie Draft", href: "/draft" },
  { title: "Auction", href: "/auction" },
  { title: "Transactions", href: "/transactions" },
  { title: "Manual", href: "/manual" },
  { title: "CBS", href: "https://mpfflog.football.cbssports.com/home" },
];

export async function SiteHeader() {
  const owner = await getSessionOwner();

  let items = NAV_ITEMS;
  // The AI connector page carries the league secret, so its link shows only
  // to signed-in owners (the page itself requires sign-in either way).
  if (owner) items = [...items, { title: "AI", href: "/mcp" }];

  return (
    <HeaderClient
      items={items}
      user={
        owner
          ? { name: owner.name, isCommissioner: owner.isCommissioner, teamId: owner.teamId }
          : null
      }
    />
  );
}
