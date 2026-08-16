import { prisma } from "@/lib/prisma";
import { getByeWeeks } from "@/lib/byes";

export async function GET() {
  const byeWeeks = await getByeWeeks();
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      rosterSpots: {
        where: { cutAt: null },
        include: { player: true },
      },
    },
  });

  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [
    [
      "Team",
      "Position",
      "Player",
      "Amount",
      "Contract",
      "B2B",
      "Designation",
      "NFL Team",
      "Bye",
      "Notes",
    ],
    ...teams.flatMap((t) =>
      t.rosterSpots.map((s) => [
        t.name,
        s.player.position,
        s.player.name,
        s.salary,
        s.contractEndSeason ?? "",
        s.isBackToBack ? "Y" : "",
        s.designation,
        s.player.nflTeam,
        byeWeeks.get(s.player.nflTeam) ?? "",
        s.notes ?? "",
      ])
    ),
  ];

  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mpffl-rosters.csv"`,
    },
  });
}
