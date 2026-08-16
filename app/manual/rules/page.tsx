import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";

/** /manual/rules lands on the newest year that has a ballot (or this year). */
export default async function RulesIndex() {
  const latest = await prisma.ruleProposal.findFirst({
    orderBy: { seasonYear: "desc" },
    select: { seasonYear: true },
  });
  redirect(`/manual/rules/${latest?.seasonYear ?? currentSeason()}`);
}
