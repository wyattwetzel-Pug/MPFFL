import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HoldoverGrid, type Cell } from "@/components/admin/holdover-grid";

export const dynamic = "force-dynamic";

const POSITIONS = ["QB", "RB", "WR", "TE", "K"];

export default async function HoldoverRatesPage() {
  const rates = await prisma.holdoverRate.findMany({ orderBy: [{ pickNumber: "asc" }] });
  const byKey = new Map(rates.map((r) => [`${r.pickNumber}|${r.position}`, r.amount]));

  const picks = Math.max(32, ...rates.map((r) => r.pickNumber));
  const rows = Array.from({ length: picks }, (_, i) => i + 1).map((pickNumber) => ({
    pickNumber,
    cells: POSITIONS.map<Cell>((position) => ({
      pickNumber,
      position,
      amount: byKey.get(`${pickNumber}|${position}`) ?? 0,
    })),
  }));

  // A gap is a pick nobody can price, which stops a draft — so it's said out
  // loud rather than left to be discovered at the worst moment.
  const gaps = rows.flatMap((r) =>
    r.cells.filter((c) => !byKey.has(`${c.pickNumber}|${c.position}`)).map((c) => `${c.pickNumber} ${c.position}`)
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Holdover rates" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        What a rookie costs to hold over, by where they were picked and what they play. These
        don&apos;t usually change — they&apos;re editable so that when they do, it doesn&apos;t
        need a deploy. Cells save as you leave them.
      </p>

      {gaps.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{gaps.length} rate{gaps.length === 1 ? "" : "s"} missing</AlertTitle>
          <AlertDescription>
            A pick with no rate can&apos;t be held over. Missing: {gaps.slice(0, 15).join(", ")}
            {gaps.length > 15 && "…"}
          </AlertDescription>
        </Alert>
      )}

      <HoldoverGrid positions={POSITIONS} rows={rows} />
    </div>
  );
}
