"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Lateral navigation between commissioner tools.
 *
 * Hidden on the index, which already lists every destination as a module —
 * the same links in a bar above them is the same navigation twice. On the
 * sub-pages it's the only way to move sideways without going back.
 */
const ADMIN_LINKS = [
  { title: "Edit Rosters", href: "/admin/rosters" },
  { title: "Owners", href: "/admin/owners" },
  { title: "League Calendar", href: "/admin/calendar" },
  { title: "Rookie Draft", href: "/admin/draft" },
  { title: "Holdover Rates", href: "/admin/holdover-rates" },
  { title: "Conditions", href: "/admin/conditions" },
  { title: "Text Messages", href: "/admin/sms" },
  { title: "Manage Players", href: "/admin/players" },
  { title: "Headshots", href: "/admin/headshots" },
  { title: "CSV Update", href: "/admin/players/csv" },
  { title: "Edit Manual", href: "/manual/edit" },
  { title: "Usage", href: "/admin/stats" },
  { title: "Styleguide", href: "/styleguide" },
];

export function AdminNav() {
  const path = usePathname();
  if (path === "/admin") return null;

  return (
    <div className="flex flex-wrap items-center gap-4 border-b pb-3 text-sm">
      <Link href="/admin" className="font-semibold text-attention">
        Commissioner
      </Link>
      {ADMIN_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={path === l.href ? "page" : undefined}
          className={
            path === l.href
              ? "font-medium text-foreground"
              : "text-muted-foreground transition-colors hover:text-primary"
          }
        >
          {l.title}
        </Link>
      ))}
    </div>
  );
}
