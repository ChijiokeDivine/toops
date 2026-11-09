-- Dual Crash: two-player PvP crash game.
-- Stakes are locked in the existing PUSD ledger before a match is created.

ALTER TABLE "User"
ADD COLUMN "clientSeed" TEXT,
ADD COLUMN "activeMatchId" TEXT;

CREATE INDEX "User_activeMatchId_idx" ON "User"("activeMatchId");

CREATE TYPE "DualMatchStatus" AS ENUM (
  'WAITING',
  'COUNTDOWN',
  'RUNNING',
  'SETTLING',
  'SETTLED',
  'INTERMISSION',
  'CANCELLED'
);

CREATE TABLE "DualTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stakePusd" BIGINT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DualTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DualTicket_userId_key" ON "DualTicket"("userId");
CREATE INDEX "DualTicket_stakePusd_expiresAt_idx" ON "DualTicket"("stakePusd", "expiresAt");

ALTER TABLE "DualTicket"
ADD CONSTRAINT "DualTicket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DualMatch" (
  "id" TEXT NOT NULL,
  "status" "DualMatchStatus" NOT NULL DEFAULT 'WAITING',
  "stakePusd" BIGINT NOT NULL,
  "potPusd" BIGINT NOT NULL,
  "feePusd" BIGINT NOT NULL DEFAULT 0,
  "payoutPusd" BIGINT NOT NULL DEFAULT 0,
  "winnerUserId" TEXT,
  "serverSeed" TEXT NOT NULL,
  "serverSeedHash" TEXT NOT NULL,
  "nonce" INTEGER NOT NULL DEFAULT 0,
  "crashMultiplierX100" INTEGER,
  "round" INTEGER NOT NULL DEFAULT 1,
  "replayCount" INTEGER NOT NULL DEFAULT 0,
  "roundHistory" JSONB,
  "startsAt" TIMESTAMP(3),
  "crashAt" TIMESTAMP(3),
  "intermissionEndsAt" TIMESTAMP(3),
  "readyDeadlineAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "integrityOk" BOOLEAN NOT NULL DEFAULT true,
  "rematchOfId" TEXT,
  "rematchCreatedAt" TIMESTAMP(3),
  "rematchDeclinedAt" TIMESTAMP(3),
  "disputed" BOOLEAN NOT NULL DEFAULT false,
  "disputeReason" TEXT,
  "disputeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DualMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DualMatch_status_readyDeadlineAt_idx" ON "DualMatch"("status", "readyDeadlineAt");
CREATE INDEX "DualMatch_status_intermissionEndsAt_idx" ON "DualMatch"("status", "intermissionEndsAt");
CREATE INDEX "DualMatch_winnerUserId_idx" ON "DualMatch"("winnerUserId");
CREATE INDEX "DualMatch_createdAt_idx" ON "DualMatch"("createdAt");

ALTER TABLE "DualMatch"
ADD CONSTRAINT "DualMatch_winnerUserId_fkey"
FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DualMatchPlayer" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seat" INTEGER NOT NULL,
  "stakePusd" BIGINT NOT NULL,
  "clientSeed" TEXT NOT NULL,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cashoutAt" TIMESTAMP(3),
  "cashoutMultiplierX100" INTEGER,
  "payoutPusd" BIGINT NOT NULL DEFAULT 0,
  "rematchRequested" BOOLEAN NOT NULL DEFAULT false,
  "rematchRequestedAt" TIMESTAMP(3),

  CONSTRAINT "DualMatchPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DualMatchPlayer_matchId_userId_key" ON "DualMatchPlayer"("matchId", "userId");
CREATE UNIQUE INDEX "DualMatchPlayer_matchId_seat_key" ON "DualMatchPlayer"("matchId", "seat");
CREATE INDEX "DualMatchPlayer_userId_idx" ON "DualMatchPlayer"("userId");

ALTER TABLE "DualMatchPlayer"
ADD CONSTRAINT "DualMatchPlayer_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "DualMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DualMatchPlayer"
ADD CONSTRAINT "DualMatchPlayer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
