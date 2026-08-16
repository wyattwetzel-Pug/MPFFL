import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

/*
 * The rules ballot's own share card — the v1 tradition revived. A pasted
 * ballot link shows the year, the proposals on it, and where voting
 * stands, which is what gets a league-mate to tap.
 */
export const alt = "MPFFL rule votes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  const seasonYear = Number(year);
  const [proposals, votes] = await Promise.all([
    prisma.ruleProposal.findMany({
      where: { seasonYear },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { title: true },
      take: 5,
    }),
    prisma.ruleVote.count({ where: { proposal: { seasonYear } } }),
  ]);
  const logo = readFileSync(join(process.cwd(), "public", "mpffl-logo-white.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          gap: 20,
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={src} alt="" width={84} height={84} />
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700, letterSpacing: -1, gap: 14 }}>
            {seasonYear} Rule Votes
          </div>
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa", display: "flex" }}>
          {proposals.length === 0
            ? "The ballot is being drafted."
            : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} · ${votes} team vote${votes === 1 ? "" : "s"} cast · REPLACE-WITH-YOUR-DOMAIN.example`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {proposals.map((p, i) => (
            <div key={i} style={{ display: "flex", fontSize: 34, color: "#e4e4e7" }}>
              {i + 1}. {p.title.length > 52 ? p.title.slice(0, 52) + "…" : p.title}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
