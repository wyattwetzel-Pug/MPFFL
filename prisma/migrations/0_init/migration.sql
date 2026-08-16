-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('QB', 'RB', 'WR', 'TE', 'K', 'OTHER');

-- CreateEnum
CREATE TYPE "RosterDesignation" AS ENUM ('ACTIVE', 'IR', 'PS');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TRADE', 'WAIVER', 'CONDITIONAL_CUT', 'UNCONDITIONAL_CUT', 'ROOKIE_PICK_SELECTION', 'AUCTION_WIN', 'AUCTION_CLEAR', 'AUCTION_DECLARATION', 'ALLOCATION', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'COMPLETED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CAP_DOLLARS', 'ROOKIE_PICK', 'TOPPER_HOLDOVER', 'PS_SPOT', 'CONDITIONAL_CUT', 'UNCONDITIONAL_CUT', 'PLAYER', 'OTHER');

-- CreateEnum
CREATE TYPE "MilestoneKey" AS ENUM ('LEAGUE_YEAR_START', 'CONTRACT_SETTLEMENT', 'AUCTION', 'ROSTER_CUTDOWN', 'TRADE_DEADLINE');

-- CreateEnum
CREATE TYPE "ConditionOutcome" AS ENUM ('CONVEYED', 'NOT_MET', 'REPLACED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PRIVACY', 'TOU', 'SMS');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('WEB', 'SMS_STOP', 'COMMISSIONER', 'MIGRATION');

-- CreateEnum
CREATE TYPE "DraftSelection" AS ENUM ('HOLDOVER', 'TOP');

-- CreateEnum
CREATE TYPE "RuleVoteChoice" AS ENUM ('AYE', 'NAY', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "RuleOutcome" AS ENUM ('PASSED', 'FAILED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "owners" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "isCommissioner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "privacyConsentAt" TIMESTAMP(3),
    "touConsentAt" TIMESTAMP(3),
    "smsConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_owners" (
    "teamId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,

    CONSTRAINT "team_owners_pkey" PRIMARY KEY ("teamId","ownerId")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_views" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "nflTeam" TEXT NOT NULL,
    "rookieYear" INTEGER,
    "headshotUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_spots" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "salary" INTEGER NOT NULL,
    "contractEndSeason" INTEGER,
    "contractStartSeason" INTEGER,
    "acquiredForSeason" INTEGER,
    "designation" "RosterDesignation" NOT NULL DEFAULT 'ACTIVE',
    "psSeason" INTEGER,
    "isBackToBack" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cutAt" TIMESTAMP(3),

    CONSTRAINT "roster_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_versions" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'MPFFL League Manual',
    "doc" JSONB NOT NULL,
    "html" TEXT NOT NULL,
    "summary" TEXT,
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "year" INTEGER NOT NULL,
    "auctionDate" TIMESTAMP(3),
    "cutdownDate" TIMESTAMP(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "nfl_team_byes" (
    "season" INTEGER NOT NULL,
    "nflTeam" TEXT NOT NULL,
    "week" INTEGER NOT NULL,

    CONSTRAINT "nfl_team_byes_pkey" PRIMARY KEY ("season","nflTeam")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT,
    "submittedByOwnerId" INTEGER,
    "submittedForTeamId" INTEGER,
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "fromTeamId" INTEGER,
    "toTeamId" INTEGER,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "playerId" INTEGER,
    "round" INTEGER,
    "pickNumber" INTEGER,
    "originTeamId" INTEGER,
    "label" TEXT,
    "details" JSONB,
    "isContingent" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "conditionId" INTEGER,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_status_log" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "oldStatus" "TransactionStatus",
    "newStatus" "TransactionStatus" NOT NULL,
    "changedByOwnerId" INTEGER,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "transaction_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMilestone" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "key" "MilestoneKey" NOT NULL,
    "occursAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "setByOwnerId" INTEGER,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "decideBy" TIMESTAMP(3),
    "createdByOwnerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "outcome" "ConditionOutcome",
    "resolutionNote" TEXT,
    "resolvedByOwnerId" INTEGER,
    "resolutionTransactionId" INTEGER,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "actorOwnerId" INTEGER,
    "policyEffective" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "toPhone" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "twilioSid" TEXT,
    "errorCode" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" TEXT NOT NULL,
    "triggerData" JSONB,
    "sentByOwnerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsInbound" (
    "id" SERIAL NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ownerId" INTEGER,
    "twilioSid" TEXT,
    "handledAs" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsInbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldoverRate" (
    "id" SERIAL NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldoverRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_configs" (
    "seasonYear" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "pickWindow" INTEGER NOT NULL DEFAULT 720,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_configs_pkey" PRIMARY KEY ("seasonYear")
);

-- CreateTable
CREATE TABLE "draft_picks" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playerId" INTEGER,
    "selection" "DraftSelection",
    "holdoverAmount" INTEGER,
    "pickedAt" TIMESTAMP(3),
    "pickedByOwnerId" INTEGER,
    "onBehalf" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" INTEGER,
    "openNotifiedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominations" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_slates" (
    "seasonYear" INTEGER NOT NULL,
    "locksAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_slates_pkey" PRIMARY KEY ("seasonYear")
);

-- CreateTable
CREATE TABLE "rule_proposals" (
    "id" SERIAL NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "proposedByTeamId" INTEGER,
    "proposedByLabel" TEXT NOT NULL,
    "iconUrl" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "RuleOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_votes" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "choice" "RuleVoteChoice" NOT NULL,
    "castByOwnerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_comments" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "teamId" INTEGER NOT NULL,
    "authorOwnerId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_email_key" ON "owners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_abbreviation_key" ON "teams"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "team_owners_ownerId_key" ON "team_owners"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_tokenHash_key" ON "login_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "page_views_ownerId_at_idx" ON "page_views"("ownerId", "at");

-- CreateIndex
CREATE INDEX "page_views_path_idx" ON "page_views"("path");

-- CreateIndex
CREATE INDEX "page_views_at_idx" ON "page_views"("at");

-- CreateIndex
CREATE UNIQUE INDEX "players_name_position_key" ON "players"("name", "position");

-- CreateIndex
CREATE INDEX "roster_spots_teamId_cutAt_idx" ON "roster_spots"("teamId", "cutAt");

-- CreateIndex
CREATE UNIQUE INDEX "manual_versions_version_key" ON "manual_versions"("version");

-- CreateIndex
CREATE INDEX "manual_versions_version_idx" ON "manual_versions"("version");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_seasonYear_assetType_idx" ON "ledger_entries"("seasonYear", "assetType");

-- CreateIndex
CREATE INDEX "ledger_entries_fromTeamId_idx" ON "ledger_entries"("fromTeamId");

-- CreateIndex
CREATE INDEX "ledger_entries_toTeamId_idx" ON "ledger_entries"("toTeamId");

-- CreateIndex
CREATE INDEX "transaction_status_log_transactionId_idx" ON "transaction_status_log"("transactionId");

-- CreateIndex
CREATE INDEX "LeagueMilestone_seasonYear_idx" ON "LeagueMilestone"("seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMilestone_seasonYear_key_key" ON "LeagueMilestone"("seasonYear", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Condition_resolutionTransactionId_key" ON "Condition"("resolutionTransactionId");

-- CreateIndex
CREATE INDEX "Condition_resolvedAt_idx" ON "Condition"("resolvedAt");

-- CreateIndex
CREATE INDEX "Condition_transactionId_idx" ON "Condition"("transactionId");

-- CreateIndex
CREATE INDEX "ConsentEvent_ownerId_kind_idx" ON "ConsentEvent"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "ConsentEvent_createdAt_idx" ON "ConsentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_ownerId_createdAt_idx" ON "SmsMessage"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsInbound_twilioSid_key" ON "SmsInbound"("twilioSid");

-- CreateIndex
CREATE INDEX "SmsInbound_createdAt_idx" ON "SmsInbound"("createdAt");

-- CreateIndex
CREATE INDEX "HoldoverRate_pickNumber_idx" ON "HoldoverRate"("pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HoldoverRate_pickNumber_position_key" ON "HoldoverRate"("pickNumber", "position");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_transactionId_key" ON "draft_picks"("transactionId");

-- CreateIndex
CREATE INDEX "draft_picks_seasonYear_pickedAt_idx" ON "draft_picks"("seasonYear", "pickedAt");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_seasonYear_slot_key" ON "draft_picks"("seasonYear", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_seasonYear_playerId_key" ON "draft_picks"("seasonYear", "playerId");

-- CreateIndex
CREATE INDEX "nominations_seasonYear_closedAt_idx" ON "nominations"("seasonYear", "closedAt");

-- CreateIndex
CREATE INDEX "rule_proposals_seasonYear_displayOrder_idx" ON "rule_proposals"("seasonYear", "displayOrder");

-- CreateIndex
CREATE INDEX "rule_votes_teamId_idx" ON "rule_votes"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "rule_votes_proposalId_teamId_key" ON "rule_votes"("proposalId", "teamId");

-- CreateIndex
CREATE INDEX "rule_comments_proposalId_createdAt_idx" ON "rule_comments"("proposalId", "createdAt");

-- AddForeignKey
ALTER TABLE "team_owners" ADD CONSTRAINT "team_owners_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_owners" ADD CONSTRAINT "team_owners_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_spots" ADD CONSTRAINT "roster_spots_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_spots" ADD CONSTRAINT "roster_spots_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_versions" ADD CONSTRAINT "manual_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfl_team_byes" ADD CONSTRAINT "nfl_team_byes_season_fkey" FOREIGN KEY ("season") REFERENCES "seasons"("year") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_submittedByOwnerId_fkey" FOREIGN KEY ("submittedByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_status_log" ADD CONSTRAINT "transaction_status_log_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_status_log" ADD CONSTRAINT "transaction_status_log_changedByOwnerId_fkey" FOREIGN KEY ("changedByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMilestone" ADD CONSTRAINT "LeagueMilestone_setByOwnerId_fkey" FOREIGN KEY ("setByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_resolutionTransactionId_fkey" FOREIGN KEY ("resolutionTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_createdByOwnerId_fkey" FOREIGN KEY ("createdByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_resolvedByOwnerId_fkey" FOREIGN KEY ("resolvedByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_actorOwnerId_fkey" FOREIGN KEY ("actorOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_sentByOwnerId_fkey" FOREIGN KEY ("sentByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsInbound" ADD CONSTRAINT "SmsInbound_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_pickedByOwnerId_fkey" FOREIGN KEY ("pickedByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_proposals" ADD CONSTRAINT "rule_proposals_proposedByTeamId_fkey" FOREIGN KEY ("proposedByTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_votes" ADD CONSTRAINT "rule_votes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "rule_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_votes" ADD CONSTRAINT "rule_votes_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_votes" ADD CONSTRAINT "rule_votes_castByOwnerId_fkey" FOREIGN KEY ("castByOwnerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_comments" ADD CONSTRAINT "rule_comments_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "rule_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_comments" ADD CONSTRAINT "rule_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "rule_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_comments" ADD CONSTRAINT "rule_comments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_comments" ADD CONSTRAINT "rule_comments_authorOwnerId_fkey" FOREIGN KEY ("authorOwnerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

