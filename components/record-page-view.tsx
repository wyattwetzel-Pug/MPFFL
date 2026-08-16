import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionOwner } from "@/lib/auth";

/*
 * Records that a signed-in owner looked at a page.
 *
 * Renders nothing. Lives in the root layout because that's the one component
 * every page passes through, and reads the path from the header middleware
 * sets — a server component still has no way to know its own URL.
 *
 * Two things it deliberately does not do:
 *
 *   - count anonymous traffic. Most of it here is Messages fetching every URL
 *     it previews, and counting that would make the figures say something
 *     untrue.
 *   - fail loudly. A stats row is the least important thing on any page, so a
 *     write that goes wrong must never take a page down with it.
 */

/** How long before the same owner re-viewing the same page counts again. */
const DEDUP_WINDOW_MS = 5 * 60_000;

export async function RecordPageView() {
  try {
    const owner = await getSessionOwner();
    if (!owner) return null;

    const raw = (await headers()).get("x-pathname") ?? "";
    // Query strings would fragment the counts — /draft?pick=8 and /draft are
    // the same page to anyone reading this.
    const path = raw.split("?")[0];
    if (!path.startsWith("/")) return null;

    /*
     * /draft refreshes itself every minute while a draft is running, and a
     * refresh re-renders this. Without a window, one owner leaving the board
     * open would out-view the entire league.
     */
    const recent = await prisma.pageView.findFirst({
      where: { ownerId: owner.id, path, at: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
      select: { id: true },
    });
    if (recent) return null;

    await prisma.pageView.create({ data: { ownerId: owner.id, path } });
  } catch {
    // Never break a page over analytics.
  }
  return null;
}
