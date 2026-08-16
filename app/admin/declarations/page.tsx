import type { Metadata } from "next";
import Link from "next/link";
import { requireCommissioner } from "@/lib/auth";
import { currentSeason } from "@/lib/constants";
import { declarationEligibility, declarationsList } from "@/lib/auction/declare";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Declarations — Admin" };

/*
 * §16.5 step 4 — who has declared what, and who hasn't. Commissioners see
 * everything, secret tops included; that is the point of the page.
 */
export default async function AdminDeclarationsPage() {
  await requireCommissioner();
  const season = currentSeason();
  const [eligibility, all] = await Promise.all([declarationEligibility(season), declarationsList(season)]);

  const live = all.filter((d) => d.status === "APPROVED" || d.status === "COMPLETED");
  const holdDollars = live.filter((d) => d.kind === "HOLD").reduce((n, d) => n + (d.price ?? 0), 0);

  const teams = [...eligibility.values()].sort((a, z) => a.teamName.localeCompare(z.teamName));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={`${season} Declarations — all teams`} />
      <p className="text-sm text-muted-foreground">
        {live.filter((d) => d.kind === "HOLD").length} holdover{live.filter((d) => d.kind === "HOLD").length === 1 ? "" : "s"} (${holdDollars} committed) ·{" "}
        {live.filter((d) => d.kind === "TOP").length} secret top{live.filter((d) => d.kind === "TOP").length === 1 ? "" : "s"} filed.
        Tops stay hidden from the league until the player&apos;s bidding ends.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => {
          const mine = live.filter((d) => d.teamId === t.teamId);
          return (
            <Card key={t.teamId}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between text-sm">
                  <span>{t.teamName}</span>
                  <Link href={`/declarations?team=${t.teamId}`} className="text-xs font-normal underline underline-offset-2">
                    file for them →
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-xs text-muted-foreground">
                  ${t.committed} of ${t.allocation} committed · {t.expiring.length} expiring right{t.expiring.length === 1 ? "" : "s"} · T/H {t.thUnused} unused
                </p>
                {mine.length === 0 ? (
                  <p className="text-xs text-muted-foreground">nothing filed</p>
                ) : (
                  mine.map((d) => (
                    <p key={d.transactionId}>
                      {d.kind === "HOLD" ? (
                        <>holds <b>{d.playerName}</b> at ${d.price}</>
                      ) : (
                        <>
                          tops <b>{d.playerName}</b>{" "}
                          <span className="text-xs text-attention">{d.revealed ? "revealed" : "secret"}</span>
                        </>
                      )}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
