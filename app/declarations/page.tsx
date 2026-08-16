import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { declarationEligibility, declarationsList } from "@/lib/auction/declare";
import { DeclarationsView } from "@/components/auction/declarations-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Declarations",
  description: "Pre-auction holdovers and topper rights — filed before bidding opens.",
};

/*
 * §16.9 — the owner's declaration form. Holdovers are public and instant;
 * compensatory tops are secret until the player's fate is known. Owners see
 * their own team; commissioners can switch teams to file on someone's behalf.
 */
export default async function DeclarationsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const owner = await requireOwner();
  const { team } = await searchParams;
  const season = currentSeason();

  const teams = await prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const teamId =
    owner.isCommissioner && team ? Number(team) || owner.teamId : owner.teamId;
  if (teamId == null) return null;

  const [eligibility, all] = await Promise.all([declarationEligibility(season), declarationsList(season)]);
  const mine = eligibility.get(teamId);

  return (
    <DeclarationsView
      season={season}
      teamId={teamId}
      teamName={teams.find((t) => t.id === teamId)?.name ?? ""}
      teams={owner.isCommissioner ? teams : null}
      eligibility={
        mine
          ? {
              expiring: mine.expiring,
              compTargets: mine.compTargets,
              thUnused: mine.thUnused,
              allocation: mine.allocation,
              committed: mine.committed,
            }
          : null
      }
      filed={all
        .filter((d) => d.teamId === teamId && d.status !== "WITHDRAWN" && d.status !== "REJECTED")
        .map((d) => ({
          transactionId: d.transactionId,
          playerName: d.playerName,
          position: d.position,
          kind: d.kind,
          price: d.price,
          filedAt: d.filedAt.toISOString(),
        }))}
    />
  );
}
