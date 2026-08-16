import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";
import { hiddenDeclarationTxIds } from "@/lib/auction/declare";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  describeEntry,
  StatusBadge,
  TYPE_LABEL,
  STATUS_LABEL,
  type EntryView,
} from "@/components/league/transaction-entry-list";
import { TransactionActions, type ActionEntry } from "@/components/league/transaction-actions";
import { ALLOWED_TRANSITIONS } from "@/lib/ledger/transition";
import { sniffCondition } from "@/lib/conditions";

export const dynamic = "force-dynamic";

export default async function TransactionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const txId = Number(id);
  if (!Number.isInteger(txId)) notFound();

  const [tx, owner] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        submittedBy: { select: { name: true } },
        entries: {
          include: {
            player: { select: { name: true, position: true } },
            fromTeam: { select: { name: true, abbreviation: true } },
            toTeam: { select: { name: true, abbreviation: true } },
          },
        },
        statusLogs: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { name: true } } },
        },
      },
    }),
    getSessionOwner(),
  ]);
  if (!tx) notFound();

  // §16.9: an unrevealed secret top reads as nonexistent to anyone outside
  // the declaring team — a 404, not a redaction, so the URL itself says nothing.
  if (tx.type === "AUCTION_DECLARATION") {
    const hidden = await hiddenDeclarationTxIds(
      owner ? { teamId: owner.teamId, isCommissioner: owner.isCommissioner } : null
    );
    if (hidden.includes(tx.id)) notFound();
  }

  const open = tx.entries.filter((e) => e.isContingent && !e.resolvedAt);

  /*
   * A record-only adjustment moves nothing, so no entry names a team and the
   * page would otherwise never say who it concerns. `submittedForTeamId` is a
   * bare column with no relation behind it, hence the separate lookup.
   */
  const forTeam =
    tx.entries.length === 0 && tx.submittedForTeamId
      ? await prisma.team.findUnique({
          where: { id: tx.submittedForTeamId },
          select: { name: true },
        })
      : null;

  const actionEntries: ActionEntry[] = tx.entries.map((e) => ({
    id: e.id,
    label: describeEntry(e as unknown as EntryView),
    alreadyConditional: e.isContingent,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {TYPE_LABEL[tx.type]} <StatusBadge status={tx.status} />
          </span>
        }
      />
      <p className="-mt-4 text-sm text-muted-foreground">
        #{tx.id} ·{" "}
        {tx.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        {forTeam && ` · ${forTeam.name}`}
        {tx.submittedBy && ` · filed by ${tx.submittedBy.name}`}
      </p>

      {open.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {open.length} term{open.length === 1 ? "" : "s"} still conditional — this
            transaction can&apos;t be completed until {open.length === 1 ? "it is" : "they are"}{" "}
            settled.
            <ul className="mt-1 list-disc pl-5">
              {open.map((e) => (
                <li key={e.id}>{e.condition ?? describeEntry(e as unknown as EntryView)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            What moved
          </h2>
          {tx.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing — this is a record kept for its own sake. The note below is the entry.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {tx.entries.map((e) => (
                <li key={e.id}>
                  <span className="text-muted-foreground">
                    {e.fromTeam?.name ?? "League"} → {e.toTeam?.name ?? "League"}:
                  </span>{" "}
                  {describeEntry(e as unknown as EntryView)}
                  {e.isContingent && (
                    <span className="ml-2 text-xs text-warning">
                      {e.resolvedAt ? "(condition settled)" : "(conditional)"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {tx.note && (
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Note
            </h2>
            <p className="whitespace-pre-wrap text-sm">{tx.note}</p>
          </CardContent>
        </Card>
      )}

      {owner?.isCommissioner && (
        <TransactionActions
          transactionId={tx.id}
          status={tx.status}
          allowed={ALLOWED_TRANSITIONS[tx.status]}
          entries={actionEntries}
          sniffed={sniffCondition(tx.note)}
        />
      )}

      {tx.statusLogs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </h2>
            <ul className="space-y-1 text-sm">
              {tx.statusLogs.map((l) => (
                <li key={l.id}>
                  <span className="text-muted-foreground">
                    {l.changedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>{" "}
                  {l.oldStatus ? `${STATUS_LABEL[l.oldStatus]} → ` : ""}
                  {STATUS_LABEL[l.newStatus]}
                  {l.changedBy && <span className="text-muted-foreground"> by {l.changedBy.name}</span>}
                  {l.comment && <div className="text-muted-foreground">{l.comment}</div>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Link href="/transactions" className="text-sm text-primary hover:underline">
        ← All transactions
      </Link>
    </div>
  );
}
