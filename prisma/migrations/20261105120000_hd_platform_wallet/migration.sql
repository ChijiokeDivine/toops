-- CreateEnum
CREATE TYPE "AuthChallengeKind" AS ENUM ('MESSAGE', 'TRANSACTION');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SPENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'BROADCAST', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BET', 'WIN', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "balanceSats" BIGINT NOT NULL DEFAULT 0;

-- Replace per-user encrypted mnemonics with HD derivation indexes.
ALTER TABLE "PlatformWallet" DROP COLUMN "encryptedMnemonic",
DROP COLUMN "publicKey",
ADD COLUMN "derivationIndex" INTEGER;

-- Monotonic allocator for HD receive indexes. Kept outside Prisma so address
-- allocation is atomic even with concurrent sign-ups.
CREATE SEQUENCE IF NOT EXISTS "platform_wallet_index_seq" START 1;

UPDATE "PlatformWallet"
SET "derivationIndex" = nextval('platform_wallet_index_seq')
WHERE "derivationIndex" IS NULL;

ALTER TABLE "PlatformWallet" ALTER COLUMN "derivationIndex" SET NOT NULL;

-- AlterTable
ALTER TABLE "AuthChallenge" ADD COLUMN "kind" "AuthChallengeKind" NOT NULL DEFAULT 'MESSAGE',
ADD COLUMN "transaction" TEXT;

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "vout" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "amountSats" BIGINT NOT NULL,
    "height" INTEGER,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountSats" BIGINT NOT NULL,
    "feeSats" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "txid" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountSats" BIGINT NOT NULL,
    "balanceAfterSats" BIGINT NOT NULL,
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_address_idx" ON "Deposit"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_txid_vout_key" ON "Deposit"("txid", "vout");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_txid_key" ON "Withdrawal"("txid");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reference_key" ON "LedgerEntry"("reference");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformWallet_derivationIndex_key" ON "PlatformWallet"("derivationIndex");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
