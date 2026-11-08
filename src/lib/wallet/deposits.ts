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
import { satsToPusdUnits } from '@/lib/pusd'
import { getPusdDustSats, getPusdRate, getPusdTokenId } from '@/lib/pusd-server'
import { swapBchToPusd } from './swaps'

export type DepositSyncResult = {
  newDeposits: number
  creditedPusd: bigint
  swappedDeposits: number
  scannedTransactions: number
  errors: string[]
}

/** Deposits below this are credited in PUSD at the oracle rate without a swap. */
const MIN_SWAP_SATS = 50_000n

function p2pkhLockingBytecode(address: string): Uint8Array {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(`Invalid platform address: ${decoded}`)
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Platform address must be P2PKH')
  }
  return encodeLockingBytecodeP2pkh(decoded.payload)
}

async function creditDeposit(params: {
  depositId: string
  userId: string
  amountPusd: bigint
  amountSats: bigint
  swapTxid?: string | null
  swapError?: string | null
  metadata?: Record<string, unknown>
}): Promise<boolean> {
  const { depositId, userId, amountPusd, amountSats, swapTxid, swapError, metadata } = params
  if (amountPusd <= 0n) return false

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.deposit.updateMany({
      where: { id: depositId, status: 'PENDING' },
      data: {
        status: 'CONFIRMED',
        amountPusd,
        amountSats,
        swapTxid: swapTxid ?? null,
        swapError: swapError ?? null,
      },
    })
    if (claimed.count !== 1) return false

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balancePusd: { increment: amountPusd } },
    })

    await tx.ledgerEntry.create({
      data: {
        userId,
        kind: 'DEPOSIT',
        amountPusd,
        balanceAfterPusd: updated.balancePusd,
        reference: `deposit:${depositId}`,
        metadata: {
          ...metadata,
          amountSats: amountSats.toString(),
          swapTxid: swapTxid ?? null,
          swapError: swapError ?? null,
        },
      },
    })

    return true
  })
}

/**
 * Scans the user's HD receive address. PUSD token outputs are credited 1:1;
 * native BCH outputs are swapped to PUSD through Cauldron and credited from the
 * swap result. Idempotency comes from the unique `(txid, vout)` index.
 */
export async function syncUserDeposits(userId: string): Promise<DepositSyncResult> {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } })
  if (!wallet) {
    return {
      newDeposits: 0,
      creditedPusd: 0n,
      swappedDeposits: 0,
      scannedTransactions: 0,
      errors: [],
    }
  }

  const tokenId = getPusdTokenId()
  const rate = await getPusdRate()
  const dust = getPusdDustSats()
  const lockingBytecode = p2pkhLockingBytecode(wallet.address)
  const expectedLockingHex = binToHex(lockingBytecode)

  const [history, knownDeposits, withdrawals] = await Promise.all([
    getAddressHistory(wallet.address),
    prisma.deposit.findMany({
      where: { address: wallet.address },
      select: { txid: true, swapTxid: true },
    }),
    prisma.withdrawal.findMany({
      where: { userId, txid: { not: null } },
      select: { txid: true },
    }),
  ])

  const knownTxids = new Set(knownDeposits.map((deposit) => deposit.txid))
  for (const deposit of knownDeposits) {
    if (deposit.swapTxid) knownTxids.add(deposit.swapTxid)
  }
  const outboundTxids = new Set(
    withdrawals
      .map((withdrawal) => withdrawal.txid)
      .filter((txid): txid is string => Boolean(txid)),
  )

  const confirmed = history.filter((item) => item.height > 0)
  confirmed.sort((a, b) => a.height - b.height)

  let newDeposits = 0
  let creditedPusd = 0n
  let swappedDeposits = 0
  let scannedTransactions = 0
  const errors: string[] = []

  for (const item of confirmed) {
    if (knownTxids.has(item.tx_hash)) continue

    const raw = await getTransactionHex(item.tx_hash)
    scannedTransactions += 1

    const transaction = decodeTransactionBch(hexToBin(raw))
    if (typeof transaction === 'string') continue

    // A withdrawal or swap spends platform UTXOs and may send change back to
    // the same address. Those outputs are not new deposits.
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

      const token = output.token
      const isPusd =
        token &&
        !token.nft &&
        token.amount > 0n &&
        binToHex(token.category).toLowerCase() === tokenId.toLowerCase()

      if (token && !isPusd) continue
      if (!token && output.valueSatoshis < dust) continue

      try {
        const deposit = await prisma.deposit.create({
          data: {
            userId,
            txid: item.tx_hash,
            vout,
            address: wallet.address,
            amountSats: token ? 0n : output.valueSatoshis,
            amountPusd: 0n,
            height: item.height,
            status: 'PENDING',
          },
        })

        if (token) {
          const credited = await creditDeposit({
            depositId: deposit.id,
            userId,
            amountPusd: token.amount,
            amountSats: 0n,
            metadata: {
              txid: item.tx_hash,
              vout,
              height: item.height,
              asset: 'PUSD',
              category: tokenId,
            },
          })
          if (credited) {
            newDeposits += 1
            creditedPusd += token.amount
          }
          continue
        }

        // Native BCH: swap to PUSD when possible, otherwise credit at the
        // oracle rate (the platform keeps the BCH as a payout reserve).
        let amountPusd: bigint
        let swapTxid: string | null = null
        let swapError: string | null = null

        if (output.valueSatoshis >= MIN_SWAP_SATS) {
          try {
            const swap = await swapBchToPusd({
              platformAddress: wallet.address,
              derivationIndex: wallet.derivationIndex,
              bchSats: output.valueSatoshis,
            })
            amountPusd = swap.pusdReceived
            swapTxid = swap.txid
            swappedDeposits += 1
          } catch (error) {
            swapError = error instanceof Error ? error.message : String(error)
            amountPusd = satsToPusdUnits(output.valueSatoshis, rate.satsPerPusd)
          }
        } else {
          swapError = `Below swap minimum (${MIN_SWAP_SATS} sats)`
          amountPusd = satsToPusdUnits(output.valueSatoshis, rate.satsPerPusd)
        }

        const credited = await creditDeposit({
          depositId: deposit.id,
          userId,
          amountPusd,
          amountSats: output.valueSatoshis,
          swapTxid,
          swapError,
          metadata: {
            txid: item.tx_hash,
            vout,
            height: item.height,
            asset: 'BCH',
            bchUsdPrice: rate.bchUsdPrice,
          },
        })
        if (credited) {
          newDeposits += 1
          creditedPusd += amountPusd
          if (swapError) errors.push(`${item.tx_hash}:${vout}: ${swapError}`)
        }
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

  return {
    newDeposits,
    creditedPusd,
    swappedDeposits,
    scannedTransactions,
    errors,
  }
}

export type BulkSyncResult = {
  users: number
  scannedUsers: number
  newDeposits: number
  creditedPusd: bigint
  swappedDeposits: number
  errors: Array<{ userId: string; error: string }>
}

export async function syncAllDeposits(limit = 50): Promise<BulkSyncResult> {
  const take = Math.min(Math.max(limit, 1), 200)
  const total = await prisma.platformWallet.count()

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
  let creditedPusd = 0n
  let swappedDeposits = 0
  let scannedUsers = 0
  const errors: Array<{ userId: string; error: string }> = []

  for (const wallet of wallets) {
    try {
      const result = await syncUserDeposits(wallet.userId)
      newDeposits += result.newDeposits
      creditedPusd += result.creditedPusd
      swappedDeposits += result.swappedDeposits
      scannedUsers += 1
    } catch (error) {
      errors.push({
        userId: wallet.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { users: wallets.length, scannedUsers, newDeposits, creditedPusd, swappedDeposits, errors }
}
