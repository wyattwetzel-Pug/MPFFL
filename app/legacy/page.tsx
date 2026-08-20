import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TextLink } from "@/components/ui/text-link";
import { legacyStandings } from "@/lib/legacy/standings";

export const metadata: Metadata = {
  title: "Legacy",
  description: "All-time MPFFL standings carried over from the parent league.",
};

const dash = <span className="text-muted-foreground">–</span>;

export default function LegacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Legacy" />
      <p className="text-sm text-muted-foreground">
        All-time standings from the parent league, frozen at the fork.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">W</TableHead>
                <TableHead className="text-center">L</TableHead>
                <TableHead className="text-center">Win %</TableHead>
                <TableHead className="text-center">PF</TableHead>
                <TableHead className="text-center">PA</TableHead>
                <TableHead className="text-center">Scoring Titles</TableHead>
                <TableHead className="text-center">Playoff Apps</TableHead>
                <TableHead className="text-center">Playoff Record</TableHead>
                <TableHead className="text-center">1 Seeds</TableHead>
                <TableHead className="text-center">Title Apps</TableHead>
                <TableHead className="text-center">Titles</TableHead>
                <TableHead className="text-center">BPOTYA</TableHead>
                <TableHead className="text-center">COTY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {legacyStandings.map((row) => (
                <TableRow key={`${row.team}-${row.slug}`}>
                  <TableCell className="font-medium">
                    <TextLink href={`/teams/${row.slug}`}>{row.team}</TextLink>
                  </TableCell>
                  <TableCell className="text-center">{row.wins}</TableCell>
                  <TableCell className="text-center">{row.losses}</TableCell>
                  <TableCell className="text-center">{row.winPct}</TableCell>
                  <TableCell className="text-center">{row.pointsScored}</TableCell>
                  <TableCell className="text-center">{row.pointsAgainst}</TableCell>
                  <TableCell className="text-center">{row.highestScorerSeasons ?? dash}</TableCell>
                  <TableCell className="text-center">{row.playoffAppearances ?? dash}</TableCell>
                  <TableCell className="text-center">{row.playoffRecord ?? dash}</TableCell>
                  <TableCell className="text-center">{row.oneSeedAppearances ?? dash}</TableCell>
                  <TableCell className="text-center">{row.titleAppearances ?? dash}</TableCell>
                  <TableCell className="text-center">{row.titleWins ?? dash}</TableCell>
                  <TableCell className="text-center">{row.bpotya ?? dash}</TableCell>
                  <TableCell className="text-center">{row.coty ?? dash}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
