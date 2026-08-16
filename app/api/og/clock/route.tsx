import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/constants";
import { getBoard, slotLabel } from "@/lib/draft/board";

/*
 * The picture under a draft text.
 *
 * Three jobs, decided by what the URL names:
 *
 *   no slot — the draft itself, for the bare /draft link somebody shares in a
 *             group chat. That link used to preview the most recent pick, so
 *             sharing "come look at the draft" sent a photo of one rookie.
 *
 *   open   — "on the clock": whose pick, which slot, how long is left. Both
 *            draft texts used to link to /draft, so an owner's own on-the-clock
 *            message previewed the rookie somebody else had just taken.
 *   filled — the pick that was made, for a rookie with no portrait on file.
 *            Omitting og:image doesn't produce *no* image: Messages goes and
 *            scrapes one off the page, which is how an announcement about John
 *            Michael Gyllenborg arrived under a photograph of another player.
 *            A card that says the right thing beats a photograph of the wrong
 *            person, every time.
 *
 * Rendered from the slot number alone, so the URL can't be talked into
 * displaying something that isn't true.
 */

export const runtime = "nodejs";

const BLACK = "#0a0a0a";
const GREEN = "#15c45d";
const DIM = "#8b8b8b";

/** The league mark, simplified — the same silhouette the confetti uses. */
function Tree({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 20 26">
      <path
        d="M10 0 L15 8 L12.5 8 L17 15 L13.5 15 L19 22 L11 22 L11 26 L9 26 L9 22 L1 22 L6.5 15 L3 15 L7.5 8 L5 8 Z"
        fill={color}
      />
    </svg>
  );
}

export async function GET(req: Request) {
  const season = currentSeason();
  const slot = Number(new URL(req.url).searchParams.get("slot"));

  let team = "";
  let left = "";
  let made: { name: string; detail: string; outcome: string } | null = null;
  let overall: { headline: string; sub: string } | null = null;

  const named = Number.isInteger(slot) && slot >= 1 && slot <= 32;

  {
    const [{ slots }, config] = await Promise.all([
      getBoard(season),
      prisma.draftConfig.findUnique({ where: { seasonYear: season } }),
    ]);

    if (!named) {
      // The whole draft at a glance.
      const done = slots.filter((s) => s.pick).length;
      const open = slots.filter((s) => s.state === "open");
      overall = {
        headline: !config?.startedAt
          ? "Not started yet"
          : config.completedAt
            ? "Draft complete"
            : `${done} of ${slots.length} picks made`,
        sub:
          open.length === 0
            ? config?.completedAt
              ? "Every pick is in"
              : "The commissioner opens the first window"
            : open.length === 1
              ? `${open[0].teamName} on the clock at ${open[0].label}`
              : `${open.length} teams on the clock`,
      };
    }

    const target = slots.find((s) => s.slot === slot);
    team = target?.teamName ?? "";

    if (target?.pick) {
      made = {
        name: target.pick.playerName,
        detail: `${target.pick.position} · ${target.pick.nflTeam}`,
        outcome:
          target.pick.selection === "HOLDOVER"
            ? `held over for $${target.pick.holdoverAmount}`
            : "topping at auction",
      };
    }

    if (target?.expiresAt) {
      const mins = Math.round((target.expiresAt.getTime() - Date.now()) / 60_000);
      left =
        mins <= 0
          ? "overdue"
          : mins < 90
            ? `${mins} minutes left`
            : `${Math.round(mins / 60)} hours left`;
    } else if (config) {
      left = `${Math.round(config.pickWindow / 60)} hours to choose`;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BLACK,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Tree size={44} color="#ffffff" />
          <span style={{ color: "#ffffff", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            MPFFL
          </span>
          <span style={{ color: DIM, fontSize: 26, marginLeft: 8 }}>
            {season} rookie draft
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: GREEN, fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>
            {overall ? "ROOKIE SLOW DRAFT" : made ? `PICK ${slotLabel(slot)}` : "ON THE CLOCK"}
          </span>
          <span
            style={{
              color: "#ffffff",
              // A long name has to fit the same box a short team name does.
              fontSize: (overall?.headline ?? made?.name ?? team).length > 22 ? 62 : 84,
              fontWeight: 800,
              letterSpacing: -2,
            }}
          >
            {overall?.headline ?? made?.name ?? team ?? "Your pick"}
          </span>
          {made && <span style={{ color: DIM, fontSize: 34 }}>{made.detail}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ color: "#ffffff", fontSize: 52, fontWeight: 800 }}>
            {overall ? overall.sub : made ? team : `Pick ${slotLabel(slot)}`}
          </span>
          <span style={{ color: DIM, fontSize: 34 }}>{overall ? "" : made ? made.outcome : left}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
