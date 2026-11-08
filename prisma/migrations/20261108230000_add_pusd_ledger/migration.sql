-- PUSD ledger (ParyonUSD, 2-decimal CashToken base units).
-- Legacy satoshi columns are kept for pre-PUSD rows and payout records.

ALTER TABLE "User" ADD COLUMN "balancePusd" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Deposit"
ADD COLUMN "amountPusd" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "swapTxid" TEXT,
ADD COLUMN "swapError" TEXT,
ALTER COLUMN "amountSats" SET DEFAULT 0;

ALTER TABLE "Withdrawal"
ADD COLUMN "payoutAsset" TEXT NOT NULL DEFAULT 'PUSD',
ADD COLUMN "amountPusd" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "feePusd" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "swapTxid" TEXT,
ALTER COLUMN "amountSats" SET DEFAULT 0,
ALTER COLUMN "feeSats" SET DEFAULT 0;

ALTER TABLE "LedgerEntry"
ADD COLUMN "amountPusd" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "balanceAfterPusd" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "amountSats" SET DEFAULT 0,
ALTER COLUMN "balanceAfterSats" SET DEFAULT 0;
