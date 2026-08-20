-- CreateTable
CREATE TABLE "legacy_standings" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "winPct" TEXT NOT NULL,
    "pointsScored" TEXT NOT NULL,
    "pointsAgainst" TEXT NOT NULL,
    "highestScorerSeasons" INTEGER,
    "playoffAppearances" INTEGER,
    "playoffRecord" TEXT,
    "oneSeedAppearances" INTEGER,
    "titleAppearances" INTEGER,
    "titleWins" INTEGER,
    "bpotya" INTEGER,
    "coty" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legacy_standings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legacy_standings_sortOrder_idx" ON "legacy_standings"("sortOrder");

-- AddForeignKey
ALTER TABLE "legacy_standings" ADD CONSTRAINT "legacy_standings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
