import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { getLeagueTransactions } from "@/lib/ledger/queries";
import { PageHeader } from "@/components/ui/page-header";
import { TransactionFeed } from "@/components/league/transaction-feed";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  describeEntry,
  summarizeTransaction,
  TYPE_LABEL,
  STATUS_LABEL,
  type EntryView,
} from "@/components/league/transaction-entry-list";
import type { TransactionStatus, TransactionType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transactions", description: "Every trade, cut, holdover and auction win in the MPFFL ledger — nothing happens off the books." };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; team?: string }>;
}) {
  const { status, type, team } = await searchParams;
  const owner = await getSessionOwner();

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, abbreviation: true },
  });
  const selected = team ? teams.find((t) => t.abbreviation.toLowerCase() === team.toLowerCase()) : null;

  const transactions = await getLeagueTransactions({
    status: status || undefined,
    type: type || undefined,
    teamId: selected?.id,
    viewer: owner ? { teamId: owner.teamId, isCommissioner: owner.isCommissioner } : null,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Transactions" />
        {owner && (
          <div className="flex flex-wrap gap-2">
            {/*
              Green, not the orange accent. Orange is load-bearing across the
              site as time pressure — on the clock, overdue, test mode — and
              two permanent buttons wearing it would blunt the one signal that
              needs to mean "act now".

              The labels say what gets logged. "New Transaction" told nobody
              what a transaction was; the cut/waiver form covers everything
              that isn't a trade, so it says so.
            */}
            <Button asChild size="lg" variant="success">
              <Link href="/transactions/new/trade">
                <ArrowLeftRight /> New Trade
              </Link>
            </Button>
            <Button asChild size="lg" variant="success">
              <Link href="/transactions/new/transaction">
                <Plus /> Cut / Waiver / Other
              </Link>
            </Button>
          </div>
        )}
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <Select name="team" defaultValue={team ?? ""} className="w-52">
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.abbreviation}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={type ?? ""} className="w-44">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="w-44">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(status || type || team) && (
          <Button variant="ghost" asChild>
            <Link href="/transactions">Clear</Link>
          </Button>
        )}
      </form>

      <p className="text-sm text-muted-foreground">
        {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
        {transactions.length === 200 && " (most recent 200)"}
      </p>

      <TransactionFeed
        transactions={transactions.map((t) => ({
          id: t.id,
          type: t.type as TransactionType,
          status: t.status as TransactionStatus,
          createdAt: t.createdAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          teams: (t.entries.length === 0
            ? // A record-only adjustment has no entries to name a team, so the
              // team it was filed for is the only thing that can head the card.
              // `submittedForTeamId` is a bare column with no relation behind
              // it, so the name comes from the list already loaded above.
              [teams.find((x) => x.id === t.submittedForTeamId)?.name].filter(Boolean)
            : [
                ...new Set(
                  t.entries.flatMap((e) => [e.fromTeam?.name, e.toTeam?.name].filter(Boolean))
                ),
              ]) as string[],
          entries: t.entries.map((e) => describeEntry(e as unknown as EntryView)),
          summary: summarizeTransaction(t.type as TransactionType, t.entries as unknown as EntryView[]),
          // Shown only when nothing moved — there, the note is the transaction.
          note: t.entries.length === 0 ? t.note : null,
          /*
           * Who ends up with what. The flat list said which players were in a
           * trade but never which direction they went, so the one question
           * anybody asks of a trade — "what did we get?" — needed opening the
           * detail page. Entries with no destination (a cut, an expiry) have
           * no side and fall back to the flat list.
           */
          sides: Object.entries(
            t.entries.reduce<Record<string, string[]>>((acc, e) => {
              const to = e.toTeam?.name;
              if (!to) return acc;
              (acc[to] ??= []).push(describeEntry(e as unknown as EntryView));
              return acc;
            }, {})
          ).map(([team, gets]) => ({ team, gets: gets as string[] })),
        }))}
      />
    </div>
  );
}
