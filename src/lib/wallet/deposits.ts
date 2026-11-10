import 'server-only'

import {
  binToHex,
  decodeCashAddress,
  decodeTransactionBch,
  encodeLockingBytecodeP2pkh,
  hexToBin,
} from '@bitauth/libauth'
import { Prisma } from '@prisma/client'
import type { Deposit } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAddressHistory, getTransactionHex } from '@/lib/bch/electrum'
import { satsToPusdUnits } from '@/lib/pusd'
import type { PusdRate } from '@/lib/pusd-server'
import { getPusdDustSats, getPusdRate, getPusdTokenId } from '@/lib/pusd-server'
import { swapBchToPusd } from './swaps'

export type DepositSyncResult = {
  newDeposits: number
  /** Deposits detected but still waiting for a confirmation. */
  pendingDeposits: number
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

function outpointKey(txid: string, vout: number): string {
  return `${txid}:${vout}`
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Broadcast failures from the Cauldron SDK append a full Bitauth debug URI on
  // a separate line. Keep the first line so the database and UI stay readable.
  const firstLine = message.split('\n')[0]?.trim() ?? ''
  return firstLine.length > 300 ? `${firstLine.slice(0, 297)}...` : firstLine || 'Unknown error'
}

type DecodedOutput = {
  valueSatoshis: bigint
  token?: {
    category: Uint8Array
    amount: bigint
    nft?: unknown
  }
}

/** PUSD base units carried by an output, or `null` when it is not a PUSD token output. */
function pusdTokenAmount(output: DecodedOutput, tokenId: string): bigint | null {
  const token = output.token
  if (!token || token.nft || token.amount <= 0n) return null
  if (binToHex(token.category).toLowerCase() !== tokenId.toLowerCase()) return null
  return token.amount
}

async function readOutput(txid: string, vout: number): Promise<DecodedOutput | null> {
  const raw = await getTransactionHex(txid)
  const transaction = decodeTransactionBch(hexToBin(raw))
  if (typeof transaction === 'string') return null
  return transaction.outputs[vout] ?? null
}

/**
 * Claims an unsettled deposit row and credits the user. The conditional
 * `updateMany` is the idempotency guard: a row can move out of `PENDING` (or
 * from the legacy `CONFIRMED` + zero-PUSD state) exactly once, even when two
 * syncs race.
 */
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
      where: {
        id: depositId,
        OR: [{ status: 'PENDING' }, { status: 'CONFIRMED', amountPusd: 0n }],
      },
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
 * Marks a deposit as settled without crediting anything (e.g. an amount that
 * rounds down to zero PUSD), so it is not retried forever.
 */
async function settleWithoutCredit(depositId: string, reason: string): Promise<void> {
  await prisma.deposit.updateMany({
    where: {
      id: depositId,
      OR: [{ status: 'PENDING' }, { status: 'CONFIRMED', amountPusd: 0n }],
    },
    data: { status: 'CONFIRMED', swapError: reason },
  })
}

type SettlementContext = {
  userId: string
  address: string
  derivationIndex: number
  tokenId: string
  rate: PusdRate
}

type Settlement = {
  creditedPusd: bigint
  swapped: boolean
  errors: string[]
}

/**
 * Converts one detected deposit into PUSD: PUSD tokens are credited 1:1,
 * native BCH is swapped through Cauldron, falling back to the oracle rate when
 * the swap cannot be built (leaving the BCH in the platform reserve).
 */
async function settleDeposit(
  deposit: Deposit,
  context: SettlementContext,
): Promise<Settlement> {
  const errors: string[] = []
  let amountPusd: bigint
  let swapTxid: string | null = null
  let swapError: string | null = null
  let asset: 'PUSD' | 'BCH'

  if (deposit.amountSats === 0n) {
    // Token deposit: the row does not store the token amount, so read it back
    // from the (immutable) transaction.
    let output: DecodedOutput | null
    try {
      output = await readOutput(deposit.txid, deposit.vout)
    } catch (error) {
      errors.push(`${deposit.txid}:${deposit.vout}: ${errorMessage(error)}`)
      return { creditedPusd: 0n, swapped: false, errors }
    }
    if (!output) {
      errors.push(`${deposit.txid}:${deposit.vout}: unable to read deposit output`)
      return { creditedPusd: 0n, swapped: false, errors }
    }

    const tokenAmount = pusdTokenAmount(output, context.tokenId)
    if (tokenAmount === null) {
      await settleWithoutCredit(deposit.id, 'Unsupported token')
      errors.push(`${deposit.txid}:${deposit.vout}: unsupported token`)
      return { creditedPusd: 0n, swapped: false, errors }
    }

    amountPusd = tokenAmount
    asset = 'PUSD'
  } else {
    asset = 'BCH'

    if (deposit.amountSats >= MIN_SWAP_SATS) {
      try {
        const swap = await swapBchToPusd({
          platformAddress: context.address,
          derivationIndex: context.derivationIndex,
          bchSats: deposit.amountSats,
          // Spend the deposit outpoint itself so a swap can never drain the
          // BCH backing another user deposit.
          utxo: { txid: deposit.txid, vout: deposit.vout, satoshis: deposit.amountSats },
        })
        amountPusd = swap.pusdReceived
        swapTxid = swap.txid
      } catch (error) {
        swapError = errorMessage(error)
        amountPusd = satsToPusdUnits(deposit.amountSats, context.rate.satsPerPusd)
      }
    } else {
      swapError = `Below swap minimum (${MIN_SWAP_SATS} sats)`
      amountPusd = satsToPusdUnits(deposit.amountSats, context.rate.satsPerPusd)
    }
  }

  if (amountPusd <= 0n) {
    const reason = swapError ?? 'Deposit is too small to credit'
    await settleWithoutCredit(deposit.id, reason)
    errors.push(`${deposit.txid}:${deposit.vout}: ${reason}`)
    return { creditedPusd: 0n, swapped: false, errors }
  }

  const credited = await creditDeposit({
    depositId: deposit.id,
    userId: context.userId,
    amountPusd,
    amountSats: deposit.amountSats,
    swapTxid,
    swapError,
    metadata: {
      txid: deposit.txid,
      vout: deposit.vout,
      height: deposit.height,
      asset,
      ...(asset === 'PUSD' ? { category: context.tokenId } : { bchUsdPrice: context.rate.bchUsdPrice }),
    },
  })

  if (!credited) return { creditedPusd: 0n, swapped: false, errors }
  if (swapError) errors.push(`${deposit.txid}:${deposit.vout}: ${swapError}`)

  return { creditedPusd: amountPusd, swapped: swapTxid !== null, errors }
}

/**
 * Scans the user's HD receive address and credits every confirmed output that
 * belongs to it. PUSD token outputs are credited 1:1; native BCH outputs are
 * swapped to PUSD through Cauldron (or credited at the oracle rate when no
 * swap can be built). Idempotency comes from the unique `(txid, vout)` index
 * plus the conditional claim in {@link creditDeposit}.
 *
 * Detection and settlement are separate passes: a deposit row created by an
 * earlier run (for example because the process died or the swap failed) is
 * always retried, and pre-PUSD rows that were only credited to the legacy
 * satoshi balance are converted on the next sync.
 */
export async function syncUserDeposits(userId: string): Promise<DepositSyncResult> {
  const wallet = await prisma.platformWallet.findUnique({ where: { userId } })
  if (!wallet) {
    return {
      newDeposits: 0,
      pendingDeposits: 0,
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
      select: {
        id: true,
        txid: true,
        vout: true,
        swapTxid: true,
        status: true,
        height: true,
      },
    }),
    prisma.withdrawal.findMany({
      where: { userId, txid: { not: null } },
      select: { txid: true },
    }),
  ])

  // Platform-owned outpoints. Only transactions that spend one of these can be
  // platform change (a swap or a withdrawal); anything else, even when chained
  // to a previously seen transaction, is a genuine incoming payment.
  const platformOutpoints = new Set(
    knownDeposits.map((deposit) => outpointKey(deposit.txid, deposit.vout)),
  )
  const knownTxids = new Set(knownDeposits.map((deposit) => deposit.txid))
  for (const deposit of knownDeposits) {
    if (deposit.swapTxid) knownTxids.add(deposit.swapTxid)
  }
  const outboundTxids = new Set(
    withdrawals
      .map((withdrawal) => withdrawal.txid)
      .filter((txid): txid is string => Boolean(txid)),
  )

  // A deposit row is created while its transaction is still in the mempool and
  // settled later, once it confirms. Refresh stored heights first so a row that
  // was pending on an earlier sync can be settled by this one.
  const heightByTxid = new Map(history.map((item) => [item.tx_hash, item.height]))
  for (const deposit of knownDeposits) {
    if (deposit.status !== 'PENDING' || (deposit.height ?? 0) > 0) continue
    const height = heightByTxid.get(deposit.txid)
    if (!height || height <= 0) continue
    await prisma.deposit.updateMany({
      where: { id: deposit.id, OR: [{ height: null }, { height: { lte: 0 } }] },
      data: { height },
    })
  }

  const relevant = history.filter((item) => item.height >= 0)
  relevant.sort((a, b) => a.height - b.height)

  const errors: string[] = []
  let scannedTransactions = 0
  let pendingDeposits = 0

  // Pass 1: create a PENDING row for every new platform output.
  for (const item of relevant) {
    if (knownTxids.has(item.tx_hash)) continue

    const raw = await getTransactionHex(item.tx_hash)
    scannedTransactions += 1

    const transaction = decodeTransactionBch(hexToBin(raw))
    if (typeof transaction === 'string') continue

    const spendsPlatformOutpoint = transaction.inputs.some((input) =>
      platformOutpoints.has(
        outpointKey(binToHex(input.outpointTransactionHash), input.outpointIndex),
      ),
    )
    if (spendsPlatformOutpoint || outboundTxids.has(item.tx_hash)) continue

    for (let vout = 0; vout < transaction.outputs.length; vout += 1) {
      const output = transaction.outputs[vout]
      if (!output) continue
      if (binToHex(output.lockingBytecode) !== expectedLockingHex) continue

      const token = output.token
      if (token) {
        if (pusdTokenAmount(output, tokenId) === null) {
          errors.push(`${item.tx_hash}:${vout}: unsupported token ${binToHex(token.category)}`)
          continue
        }
      } else if (output.valueSatoshis < dust) {
        continue
      }

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
        platformOutpoints.add(outpointKey(deposit.txid, deposit.vout))
        if (item.height === 0) pendingDeposits += 1
      } catch (error) {
        // Another sync already recorded this outpoint.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue
        }
        throw error
      }
    }
  }

  // Pass 2: settle every unsettled row. This includes legacy deposits that the
  // pre-PUSD code only credited to the satoshi balance (`CONFIRMED` but no
  // PUSD amount), and rows whose swap/credit failed during an earlier run.
  const unsettled = await prisma.deposit.findMany({
    where: {
      address: wallet.address,
      // Unconfirmed rows stay pending until their transaction is mined.
      height: { gt: 0 },
      OR: [
        { status: 'PENDING' },
        {
          status: 'CONFIRMED',
          amountPusd: 0n,
          amountSats: { gt: 0n },
          swapError: null,
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  const context: SettlementContext = {
    userId,
    address: wallet.address,
    derivationIndex: wallet.derivationIndex,
    tokenId,
    rate,
  }

  let newDeposits = 0
  let creditedPusd = 0n
  let swappedDeposits = 0

  for (const deposit of unsettled) {
    const settlement = await settleDeposit(deposit, context)
    errors.push(...settlement.errors)
    if (settlement.creditedPusd > 0n) {
      newDeposits += 1
      creditedPusd += settlement.creditedPusd
      if (settlement.swapped) swappedDeposits += 1
    }
  }

  return {
    newDeposits,
    pendingDeposits,
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
  pendingDeposits: number
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
  let pendingDeposits = 0
  let creditedPusd = 0n
  let swappedDeposits = 0
  let scannedUsers = 0
  const errors: Array<{ userId: string; error: string }> = []

  for (const wallet of wallets) {
    try {
      const result = await syncUserDeposits(wallet.userId)
      newDeposits += result.newDeposits
      pendingDeposits += result.pendingDeposits
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

  return {
    users: wallets.length,
    scannedUsers,
    newDeposits,
    pendingDeposits,
    creditedPusd,
    swappedDeposits,
    errors,
  }
}
