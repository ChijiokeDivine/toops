-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xpLastClaimedAt" TIMESTAMP(3),
ADD COLUMN     "xpStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "XpClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "streak" INTEGER NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpClaim_userId_createdAt_idx" ON "XpClaim"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "XpClaim_userId_dayKey_key" ON "XpClaim"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "XpClaim" ADD CONSTRAINT "XpClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
