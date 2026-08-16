import Link from "next/link";

/*
 * The Manual section's sub-navigation: the manual itself and the rules
 * votes. Rendered by both pages so the section reads as one place.
 */
export function ManualTabs({ active }: { active: "manual" | "rules" }) {
  const tab = (key: string, title: string, href: string) => (
    <Link
      key={key}
      href={href}
      className={`border-b-2 px-1 pb-1.5 text-sm font-medium transition-colors ${
        active === key
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {title}
    </Link>
  );
  return (
    <div className="mb-4 flex gap-4 border-b">
      {tab("manual", "Manual", "/manual")}
      {tab("rules", "Rule Votes", "/manual/rules")}
    </div>
  );
}
