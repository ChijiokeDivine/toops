import 'server-only'

import {
  binToHex,
  decodeCashAddress,
  decodeTransactionBch,
  encodeLockingBytecodeP2pkh,
  hexToBin,
} from '@bitauth/libauth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAddressHistory, getTransactionHex } from '@/lib/bch/electrum'

export type DepositSyncResult = {
  newDeposits: number
  creditedSats: bigint
  scannedTransactions: number
}

function p2pkhLockingBytecode(address: string): Uint8Array {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(`Invalid platform address: ${decoded}`)
  if (decoded.type !== 'p2pkh') throw new Error('Platform address must be P2PKH')
  return encodeLockingBytecodeP2pkh(decoded.payload)
}

/**
 * Scans the user's HD receive address and credits confirmed P2PKH outputs.
 *
 * Idempotency comes from the unique `(txid, vout)` index on Deposit: a second
 * sync (or a concurrent sync) cannot credit the same output twice.
 */
export async function syncUserDeposits(userId: string): Promise<DepositSyncResult> {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } })
  if (!wallet) {
    return { newDeposits: 0, creditedSats: 0n, scannedTransactions: 0 }
  }

  const lockingBytecode = p2pkhLockingBytecode(wallet.address)
  const expectedLockingHex = binToHex(lockingBytecode)

  const [history, knownDeposits, withdrawals] = await Promise.all([
    getAddressHistory(wallet.address),
    prisma.deposit.findMany({
      where: { address: wallet.address },
      select: { txid: true },
    }),
    prisma.withdrawal.findMany({
      where: { userId, txid: { not: null } },
      select: { txid: true },
    }),
  ])

  const knownTxids = new Set(knownDeposits.map((deposit) => deposit.txid))
  const outboundTxids = new Set(
    withdrawals
      .map((withdrawal) => withdrawal.txid)
      .filter((txid): txid is string => Boolean(txid)),
  )
  const confirmed = history.filter((item) => item.height > 0)
  let newDeposits = 0
  let creditedSats = 0n
  let scannedTransactions = 0

  // Oldest first so balance history reads naturally.
  confirmed.sort((a, b) => a.height - b.height)

  for (const item of confirmed) {
    if (knownTxids.has(item.tx_hash)) continue

    const raw = await getTransactionHex(item.tx_hash)
    scannedTransactions += 1

    const transaction = decodeTransactionBch(hexToBin(raw))
    if (typeof transaction === 'string') continue

    // A withdrawal spends platform UTXOs and may send change back to the same
    // address. Its outputs are not new deposits, so skip any transaction that
    // spends a previously seen platform transaction or is a recorded
    // withdrawal.
    const spendsKnownTransaction = transaction.inputs.some((input) =>
      knownTxids.has(binToHex(input.outpointTransactionHash)),
    )
    if (spendsKnownTransaction || outboundTxids.has(item.tx_hash)) {
      knownTxids.add(item.tx_hash)
      continue
    }

    for (let vout = 0; vout < transaction.outputs.length; vout += 1) {
      const output = transaction.outputs[vout]
      if (!output) continue
      if (binToHex(output.lockingBytecode) !== expectedLockingHex) continue

      const amountSats = output.valueSatoshis

      try {
        await prisma.$transaction(async (tx) => {
          await tx.deposit.create({
            data: {
              userId,
              txid: item.tx_hash,
              vout,
              address: wallet.address,
              amountSats,
              height: item.height,
              status: 'CONFIRMED',
            },
          })

          const updated = await tx.user.update({
            where: { id: userId },
            data: { balanceSats: { increment: amountSats } },
          })

          await tx.ledgerEntry.create({
            data: {
              userId,
              kind: 'DEPOSIT',
              amountSats,
              balanceAfterSats: updated.balanceSats,
              reference: `${item.tx_hash}:${vout}`,
              metadata: { txid: item.tx_hash, vout, height: item.height },
            },
          })
        })

        newDeposits += 1
        creditedSats += amountSats
      } catch (error) {
        // Another sync already credited this outpoint.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue
        }
        throw error
      }
    }

    knownTxids.add(item.tx_hash)
  }

  return { newDeposits, creditedSats, scannedTransactions }
}

export type BulkSyncResult = {
  users: number
  scannedUsers: number
  newDeposits: number
  creditedSats: bigint
  errors: Array<{ userId: string; error: string }>
}

export async function syncAllDeposits(limit = 50): Promise<BulkSyncResult> {
  const take = Math.min(Math.max(limit, 1), 200)
  const total = await prisma.platformWallet.count()

  // Rotate through the wallet table so wallets beyond the first page are not
  // starved when the cron only scans a batch per run.
  let wallets: Array<{ userId: string }>
  if (total <= take) {
    wallets = await prisma.platformWallet.findMany({
      orderBy: { derivationIndex: 'asc' },
      take,
      select: { userId: true },
    })
  } else {
    const offset = Math.floor(Date.now() / 300_000) % total
    const firstPage = await prisma.platformWallet.findMany({
      orderBy: { derivationIndex: 'asc' },
      skip: offset,
      take,
      select: { userId: true },
    })
    const remaining = take - firstPage.length
    const secondPage =
      remaining > 0
        ? await prisma.platformWallet.findMany({
            orderBy: { derivationIndex: 'asc' },
            take: remaining,
            select: { userId: true },
          })
        : []

    const seen = new Set(firstPage.map((wallet) => wallet.userId))
    wallets = [...firstPage, ...secondPage.filter((wallet) => !seen.has(wallet.userId))]
  }

  let newDeposits = 0
  let creditedSats = 0n
  let scannedUsers = 0
  const errors: Array<{ userId: string; error: string }> = []

  for (const wallet of wallets) {
    try {
      const result = await syncUserDeposits(wallet.userId)
      newDeposits += result.newDeposits
      creditedSats += result.creditedSats
      scannedUsers += 1
    } catch (error) {
      errors.push({
        userId: wallet.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { users: wallets.length, scannedUsers, newDeposits, creditedSats, errors }
}
