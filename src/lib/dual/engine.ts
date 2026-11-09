import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'
import {
  DUAL_COUNTDOWN_MS,
  DUAL_DISCONNECT_GRACE_MS,
  DUAL_INTERMISSION_MS,
  DUAL_MAX_DISPUTE_REASON_LENGTH,
  DUAL_MAX_STAKE_PUSD,
  DUAL_MIN_STAKE_PUSD,
  DUAL_QUEUE_TTL_MS,
  DUAL_READY_TIMEOUT_MS,
} from './config'
import { elapsedMsForMultiplierX100, multiplierX100AtElapsed } from './curve'
import {
  computeCrash,
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
  type CrashResult,
} from './fair'
import { projectedPayoutPusd } from './settlement'

export { calculateFeePusd, projectedPayoutPusd } from './settlement'
import type {
  DualHistoryItem,
  DualMatchView,
  DualStateResponse,
  DualStatus,
  DualVerifyResponse,
} from './types'

const MATCH_INCLUDE = {
  players: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          clientSeed: true,
        },
      },
    },
    orderBy: { seat: 'asc' as const },
  },
} satisfies Prisma.DualMatchInclude

type MatchWithPlayers = Prisma.DualMatchGetPayload<{ include: typeof MATCH_INCLUDE }>
type PlayerWithUser = MatchWithPlayers['players'][number]
type Tx = Prisma.TransactionClient

const TERMINAL: ReadonlySet<DualStatus> = new Set(['SETTLED', 'CANCELLED'])
const CANCELLABLE: ReadonlySet<DualStatus> = new Set(['WAITING', 'COUNTDOWN', 'INTERMISSION'])

export class DualError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'DUAL_ERROR') {
    super(message)
    this.name = 'DualError'
    this.status = status
    this.code = code
  }
}

// ── locking helpers ─────────────────────────────────────────

async function acquireLock(tx: Tx, key: string): Promise<void> {
  // `pg_advisory_xact_lock` returns void, which Prisma cannot deserialize from
  // `$queryRaw`. `$executeRaw` only reads the affected-row count, so it is safe.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

/**
 * Interactive transactions against the hosted database can take longer than
 * Prisma's 5s default, especially on a cold connection. Match transitions touch
 * several rows under an advisory lock, so give them room to finish.
 */
const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const

function runTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, TX_OPTIONS)
}

function matchLockKey(matchId: string): string {
  return `dual:match:${matchId}`
}

const MATCHMAKING_LOCK = 'dual:matchmaking'

// ── small helpers ───────────────────────────────────────────

function toJsonHistory(value: Prisma.JsonValue | null): RoundHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value as unknown as RoundHistoryEntry[]
}

type RoundHistoryEntry = {
  round: number
  nonce: number
  serverSeed: string
  serverSeedHash: string
  crashMultiplierX100: number
  clientSeeds: string[]
  cashouts: Array<{ userId: string; multiplierX100: number; at: string }>
  endedAt: string
}

function isOnline(player: Pick<PlayerWithUser, 'lastSeenAt'>, now: Date): boolean {
  return now.getTime() - player.lastSeenAt.getTime() <= DUAL_DISCONNECT_GRACE_MS
}

async function ensureClientSeed(db: Pick<Tx, 'user'>, userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { clientSeed: true },
  })
  if (!user) throw new DualError('User not found.', 404, 'USER_NOT_FOUND')
  if (user.clientSeed) return user.clientSeed

  const clientSeed = generateClientSeed()
  await db.user.update({ where: { id: userId }, data: { clientSeed } })
  return clientSeed
}

async function recordLedger(
  tx: Tx,
  params: {
    userId: string
    kind: 'BET' | 'WIN' | 'ADJUSTMENT'
    amountPusd: bigint
    reference: string
    metadata?: Prisma.InputJsonValue
  },
): Promise<void> {
  const account = await tx.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { balancePusd: true },
  })

  await tx.ledgerEntry.create({
    data: {
      userId: params.userId,
      kind: params.kind,
      amountPusd: params.amountPusd,
      balanceAfterPusd: account.balancePusd,
      reference: params.reference,
      metadata: params.metadata,
    },
  })
}

function makeFreshRound(serverSeed: string, clientSeeds: string[], nonce: number): CrashResult {
  return computeCrash(serverSeed, clientSeeds, nonce)
}

// ── queue ───────────────────────────────────────────────────

export async function joinQueue(userId: string, stakePusd: bigint): Promise<{ matchId: string | null }> {
  if (stakePusd < DUAL_MIN_STAKE_PUSD) {
    throw new DualError(
      `Minimum stake is ${formatPusdUnits(DUAL_MIN_STAKE_PUSD)} PUSD.`,
      400,
      'STAKE_TOO_LOW',
    )
  }
  if (stakePusd > DUAL_MAX_STAKE_PUSD) {
    throw new DualError(
      `Maximum stake is ${formatPusdUnits(DUAL_MAX_STAKE_PUSD)} PUSD.`,
      400,
      'STAKE_TOO_HIGH',
    )
  }

  return runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const now = new Date()

    await expireTicketsWithinTx(tx, now)

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, balancePusd: true, clientSeed: true, activeMatchId: true },
    })
    if (!user) throw new DualError('User not found.', 404, 'USER_NOT_FOUND')

    if (user.activeMatchId) {
      const active = await tx.dualMatch.findUnique({
        where: { id: user.activeMatchId },
        select: { id: true, status: true, rematchDeclinedAt: true },
      })
      if (active && !TERMINAL.has(active.status)) {
        throw new DualError('Finish your current match first.', 409, 'ACTIVE_MATCH')
      }
      // A finished match may still be pinned for the result screen. Joining the
      // queue is an explicit dismissal.
      await tx.user.update({ where: { id: userId }, data: { activeMatchId: null } })
      if (active && active.status === 'SETTLED' && !active.rematchDeclinedAt) {
        await tx.dualMatch.update({
          where: { id: active.id },
          data: { rematchDeclinedAt: now },
        })
      }
    }

    const existingTicket = await tx.dualTicket.findUnique({ where: { userId } })
    if (existingTicket) {
      if (existingTicket.stakePusd === stakePusd && existingTicket.expiresAt > now) {
        return { matchId: null }
      }
      await refundTicketWithinTx(tx, existingTicket)
    }

    const clientSeed = user.clientSeed ?? (await ensureClientSeed(tx, userId))

    const debited = await tx.user.updateMany({
      where: { id: userId, balancePusd: { gte: stakePusd } },
      data: { balancePusd: { decrement: stakePusd } },
    })
    if (debited.count !== 1) {
      throw new DualError('Insufficient PUSD balance.', 409, 'INSUFFICIENT_BALANCE')
    }

    const ticket = await tx.dualTicket.create({
      data: {
        userId,
        stakePusd,
        expiresAt: new Date(now.getTime() + DUAL_QUEUE_TTL_MS),
      },
    })

    await recordLedger(tx, {
      userId,
      kind: 'BET',
      amountPusd: -stakePusd,
      reference: `dual:queue:${ticket.id}`,
      metadata: { stakePusd: stakePusd.toString(), queue: true },
    })

    // Find the oldest opponent waiting at exactly the same stake.
    const opponentTicket = await tx.dualTicket.findFirst({
      where: {
        stakePusd,
        userId: { not: userId },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!opponentTicket) return { matchId: null }

    const opponent = await tx.user.findUnique({
      where: { id: opponentTicket.userId },
      select: { id: true, clientSeed: true, activeMatchId: true },
    })

    if (!opponent || opponent.activeMatchId) {
      // Defensive: a stale ticket from a user who is already in a match.
      if (opponent) await refundTicketWithinTx(tx, opponentTicket)
      else await tx.dualTicket.delete({ where: { id: opponentTicket.id } })
      return { matchId: null }
    }

    const opponentClientSeed = opponent.clientSeed ?? (await ensureClientSeed(tx, opponent.id))

    await tx.dualTicket.deleteMany({
      where: { id: { in: [ticket.id, opponentTicket.id] } },
    })

    const match = await createMatchWithinTx(tx, [
      { userId: opponent.id, clientSeed: opponentClientSeed, stakePusd },
      { userId, clientSeed, stakePusd },
    ])

    return { matchId: match.id }
  })
}

async function refundTicketWithinTx(tx: Tx, ticket: { id: string; userId: string; stakePusd: bigint }) {
  const deleted = await tx.dualTicket.deleteMany({ where: { id: ticket.id } })
  if (deleted.count !== 1) return

  await tx.user.update({
    where: { id: ticket.userId },
    data: { balancePusd: { increment: ticket.stakePusd } },
  })

  await recordLedger(tx, {
    userId: ticket.userId,
    kind: 'ADJUSTMENT',
    amountPusd: ticket.stakePusd,
    reference: `dual:queue-refund:${ticket.id}`,
    metadata: { reason: 'queue-expired-or-left', stakePusd: ticket.stakePusd.toString() },
  })
}

async function expireTicketsWithinTx(tx: Tx, now: Date): Promise<void> {
  const expired = await tx.dualTicket.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, userId: true, stakePusd: true },
  })
  for (const ticket of expired) {
    await refundTicketWithinTx(tx, ticket)
  }
}

async function expireTicketForUser(userId: string): Promise<void> {
  const ticket = await prisma.dualTicket.findUnique({ where: { userId } })
  if (!ticket || ticket.expiresAt > new Date()) return

  await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const fresh = await tx.dualTicket.findUnique({ where: { userId } })
    if (!fresh || fresh.expiresAt > new Date()) return
    await refundTicketWithinTx(tx, fresh)
  })
}

export async function leaveQueue(userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const ticket = await tx.dualTicket.findUnique({ where: { userId } })
    if (!ticket) return
    await refundTicketWithinTx(tx, ticket)
  })
}

// ── match creation ──────────────────────────────────────────

async function createMatchWithinTx(
  tx: Tx,
  entries: Array<{ userId: string; clientSeed: string; stakePusd: bigint }>,
  rematchOfId?: string,
): Promise<MatchWithPlayers> {
  if (entries.length !== 2) throw new DualError('A match needs two players.', 500, 'BAD_MATCH')
  const stakePusd = entries[0]!.stakePusd
  if (entries[1]!.stakePusd !== stakePusd) {
    throw new DualError('Both stakes must be equal.', 400, 'STAKE_MISMATCH')
  }

  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)
  const clientSeeds = entries.map((entry) => entry.clientSeed)
  const crash = makeFreshRound(serverSeed, clientSeeds, 0)
  const now = new Date()

  const match = await tx.dualMatch.create({
    data: {
      status: 'WAITING',
      stakePusd,
      potPusd: stakePusd * 2n,
      serverSeed,
      serverSeedHash,
      nonce: 0,
      crashMultiplierX100: crash.crashMultiplierX100,
      round: 1,
      readyDeadlineAt: new Date(now.getTime() + DUAL_READY_TIMEOUT_MS),
      rematchOfId,
      players: {
        create: entries.map((entry, seat) => ({
          userId: entry.userId,
          seat,
          stakePusd: entry.stakePusd,
          clientSeed: entry.clientSeed,
          lastSeenAt: now,
        })),
      },
    },
    include: MATCH_INCLUDE,
  })

  await tx.user.updateMany({
    where: { id: { in: entries.map((entry) => entry.userId) } },
    data: { activeMatchId: match.id },
  })

  return match
}

// ── state / views ───────────────────────────────────────────

function revealed(status: DualStatus): boolean {
  return status === 'SETTLED' || status === 'INTERMISSION' || status === 'CANCELLED'
}

function statusOf(match: MatchWithPlayers): DualStatus {
  return match.status as DualStatus
}

function buildMatchView(match: MatchWithPlayers, userId: string, now: Date): DualMatchView {
  const status = statusOf(match)
  const isRevealed = revealed(status)
  const self = match.players.find((player) => player.userId === userId)
  const startsAtMs = match.startsAt?.getTime() ?? null

  let currentMultiplierX100 = 100
  if (status === 'RUNNING' && startsAtMs != null) {
    const elapsed = now.getTime() - startsAtMs
    currentMultiplierX100 = multiplierX100AtElapsed(elapsed)
    if (match.crashMultiplierX100 != null) {
      currentMultiplierX100 = Math.min(currentMultiplierX100, match.crashMultiplierX100)
    }
  } else if (isRevealed && match.crashMultiplierX100 != null) {
    currentMultiplierX100 = match.crashMultiplierX100
  }

  const countdownMsRemaining =
    status === 'COUNTDOWN' && startsAtMs != null
      ? Math.max(0, startsAtMs - now.getTime())
      : null

  const projected =
    match.status === 'CANCELLED'
      ? { feePusd: 0n, payoutPusd: 0n }
      : projectedPayoutPusd(match.potPusd)

  const players = match.players.map((player) => {
    const canSeeCashout = isRevealed || player.userId === userId
    return {
      userId: player.userId,
      displayName: player.user.displayName ?? `Player ${player.seat + 1}`,
      avatarUrl: player.user.avatarUrl,
      seat: player.seat,
      isSelf: player.userId === userId,
      stakePusd: formatPusdUnits(player.stakePusd),
      ready: player.ready,
      online: isOnline(player, now),
      cashedOut: canSeeCashout && player.cashoutAt != null,
      cashoutMultiplierX100: canSeeCashout ? player.cashoutMultiplierX100 : null,
      payoutPusd: isRevealed ? formatPusdUnits(player.payoutPusd) : '0.00',
      rematchRequested: player.rematchRequested,
    }
  })

  const selfPlayer = self
  const selfCashedOut = selfPlayer
    ? status === 'RUNNING' || isRevealed
      ? selfPlayer.cashoutAt != null
      : false
    : false

  const canCashOut =
    status === 'RUNNING' &&
    selfPlayer != null &&
    !selfCashedOut &&
    now.getTime() < (match.crashAt?.getTime() ?? 0)

  return {
    id: match.id,
    status,
    round: match.round,
    replayCount: match.replayCount,
    stakePusd: formatPusdUnits(match.stakePusd),
    potPusd: formatPusdUnits(match.potPusd),
    feePusd: formatPusdUnits(match.feePusd > 0n ? match.feePusd : projected.feePusd),
    payoutPusd: formatPusdUnits(
      match.payoutPusd > 0n ? match.payoutPusd : projected.payoutPusd,
    ),
    winnerUserId: status === 'SETTLED' ? match.winnerUserId : null,
    serverSeedHash: match.serverSeedHash,
    serverSeed: isRevealed ? match.serverSeed : null,
    nonce: isRevealed ? match.nonce : null,
    crashMultiplierX100: isRevealed ? match.crashMultiplierX100 : null,
    startsAt: match.startsAt?.toISOString() ?? null,
    crashAt: isRevealed ? match.crashAt?.toISOString() ?? null : null,
    intermissionEndsAt: match.intermissionEndsAt?.toISOString() ?? null,
    readyDeadlineAt: match.readyDeadlineAt?.toISOString() ?? null,
    endedAt: match.endedAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    currentMultiplierX100,
    countdownMsRemaining,
    players,
    viewer: {
      isPlayer: selfPlayer != null,
      hasCashedOut: selfCashedOut,
      cashoutMultiplierX100: selfPlayer?.cashoutMultiplierX100 ?? null,
      canCashOut,
      canCancel: selfPlayer != null && CANCELLABLE.has(status),
      canRematch:
        selfPlayer != null &&
        status === 'SETTLED' &&
        match.rematchCreatedAt == null,
      canLeave: selfPlayer != null && TERMINAL.has(status) && match.rematchCreatedAt == null,
    },
    rematchDeclined: match.rematchDeclinedAt != null,
    disputed: match.disputed,
    disputeReason: match.disputeReason,
    refunded: status === 'CANCELLED',
  }
}

async function loadMatchForView(matchId: string): Promise<MatchWithPlayers | null> {
  return prisma.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
}

export async function getDualState(userId: string): Promise<DualStateResponse> {
  const initial = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      balancePusd: true,
      clientSeed: true,
      activeMatchId: true,
    },
  })
  if (!initial) throw new DualError('User not found.', 404, 'USER_NOT_FOUND')

  if (initial.activeMatchId) {
    const now = new Date()
    await prisma.dualMatchPlayer.updateMany({
      where: { matchId: initial.activeMatchId, userId },
      data: { lastSeenAt: now },
    })
    await advanceMatch(initial.activeMatchId).catch((error) => {
      console.error('[dual] advance failed', initial.activeMatchId, error)
    })
  } else {
    await expireTicketForUser(userId).catch((error) => {
      console.error('[dual] ticket expiry failed', userId, error)
    })
  }

  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        balancePusd: true,
        clientSeed: true,
        activeMatchId: true,
      },
    }),
    prisma.dualTicket.findUnique({ where: { userId } }),
  ])

  if (!user) throw new DualError('User not found.', 404, 'USER_NOT_FOUND')

  const clientSeed = user.clientSeed ?? (await ensureClientSeed(prisma, userId))
  const match = user.activeMatchId ? await loadMatchForView(user.activeMatchId) : null
  const now = new Date()

  return {
    serverNow: now.toISOString(),
    user: {
      id: user.id,
      displayName: user.displayName ?? 'Player',
      avatarUrl: user.avatarUrl,
      balancePusd: formatPusdUnits(user.balancePusd),
      clientSeed,
    },
    queue: ticket
      ? {
          stakePusd: formatPusdUnits(ticket.stakePusd),
          expiresAt: ticket.expiresAt.toISOString(),
        }
      : null,
    match: match ? buildMatchView(match, userId, now) : null,
  }
}

// ── readiness ───────────────────────────────────────────────

export async function markReady(matchId: string, userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (!match.players.some((player) => player.userId === userId)) {
      throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    }
    if (TERMINAL.has(statusOf(match))) return

    const now = new Date()
    await tx.dualMatchPlayer.updateMany({
      where: { matchId, userId },
      data: { ready: true, lastSeenAt: now },
    })

    if (match.status === 'WAITING') {
      const bothReady = match.players.every(
        (player) => player.ready || player.userId === userId,
      )
      if (bothReady) {
        await tx.dualMatch.update({
          where: { id: matchId },
          data: {
            status: 'COUNTDOWN',
            startsAt: new Date(now.getTime() + DUAL_COUNTDOWN_MS),
            readyDeadlineAt: null,
          },
        })
      }
    }
  })
}

// ── cashout ─────────────────────────────────────────────────

export async function cashOut(matchId: string, userId: string): Promise<{ multiplierX100: number }> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')

    const player = match.players.find((entry) => entry.userId === userId)
    if (!player) throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    if (match.status !== 'RUNNING' || !match.startsAt || !match.crashAt) {
      throw new DualError('The round is not running.', 409, 'NOT_RUNNING')
    }

    const now = new Date()
    if (now.getTime() >= match.crashAt.getTime()) {
      throw new DualError('Too late — the rocket crashed.', 409, 'TOO_LATE')
    }
    if (player.cashoutAt) {
      throw new DualError('You already cashed out.', 409, 'ALREADY_CASHED_OUT')
    }

    const multiplierX100 = multiplierX100AtElapsed(now.getTime() - match.startsAt.getTime())
    const crashX100 = match.crashMultiplierX100 ?? Number.MAX_SAFE_INTEGER
    if (multiplierX100 >= crashX100) {
      throw new DualError('Too late — the rocket crashed.', 409, 'TOO_LATE')
    }

    await tx.dualMatchPlayer.update({
      where: { id: player.id },
      data: { cashoutAt: now, cashoutMultiplierX100: multiplierX100 },
    })

    const updatedPlayers = match.players.map((entry) =>
      entry.id === player.id
        ? { ...entry, cashoutAt: now, cashoutMultiplierX100: multiplierX100 }
        : entry,
    )

    if (updatedPlayers.every((entry) => entry.cashoutAt != null)) {
      const winner = latestCashout(updatedPlayers)
      if (winner) {
        await settleWithinTx(tx, match, winner, now)
      }
    }

    return { multiplierX100 }
  })
}

function latestCashout(players: PlayerWithUser[]): PlayerWithUser | null {
  const cashed = players.filter((player) => player.cashoutAt != null)
  if (cashed.length === 0) return null
  cashed.sort((a, b) => {
    const timeDelta = a.cashoutAt!.getTime() - b.cashoutAt!.getTime()
    if (timeDelta !== 0) return timeDelta
    const multiplierDelta = (a.cashoutMultiplierX100 ?? 0) - (b.cashoutMultiplierX100 ?? 0)
    if (multiplierDelta !== 0) return multiplierDelta
    return a.seat - b.seat
  })
  return cashed[cashed.length - 1] ?? null
}

// ── phase advancement ───────────────────────────────────────

export async function advanceMatch(matchId: string): Promise<void> {
  // A match can move through several phases in one call (e.g. the server was
  // asleep through the countdown and the crash). The loop is bounded.
  for (let step = 0; step < 6; step++) {
    const match = await prisma.dualMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        crashAt: true,
        readyDeadlineAt: true,
        intermissionEndsAt: true,
      },
    })
    if (!match) return

    const status = match.status as DualStatus
    if (TERMINAL.has(status)) return
    const now = new Date()

    if (status === 'WAITING') {
      if (match.readyDeadlineAt && now.getTime() > match.readyDeadlineAt.getTime()) {
        const changed = await cancelMatch(matchId, 'Players did not load in time.')
        if (!changed) return
        continue
      }
      const ready = await prisma.dualMatchPlayer.findMany({
        where: { matchId },
        select: { ready: true, lastSeenAt: true },
      })
      if (ready.length !== 2) return
      if (ready.every((player) => player.ready)) {
        const changed = await startCountdown(matchId)
        if (!changed) return
        continue
      }
      return
    }

    if (status === 'COUNTDOWN') {
      const players = await prisma.dualMatchPlayer.findMany({
        where: { matchId },
        select: { ready: true, lastSeenAt: true },
      })
      if (players.length !== 2) return
      if (players.some((player) => !isOnlineLite(player.lastSeenAt, now))) {
        const changed = await cancelMatch(matchId, 'A player disconnected before launch.')
        if (!changed) return
        continue
      }
      if (match.startsAt && now.getTime() >= match.startsAt.getTime()) {
        const changed = await startRunning(matchId)
        if (!changed) return
        continue
      }
      return
    }

    if (status === 'RUNNING') {
      if (!match.crashAt || now.getTime() < match.crashAt.getTime()) return
      const changed = await finalizeRound(matchId, now)
      if (!changed) return
      continue
    }

    if (status === 'INTERMISSION') {
      if (!match.intermissionEndsAt || now.getTime() < match.intermissionEndsAt.getTime()) {
        return
      }
      const players = await prisma.dualMatchPlayer.findMany({
        where: { matchId },
        select: { ready: true, lastSeenAt: true },
      })
      if (players.length !== 2) return
      if (players.some((player) => !isOnlineLite(player.lastSeenAt, now))) {
        const changed = await cancelMatch(matchId, 'A player left during the replay intermission.')
        if (!changed) return
        continue
      }
      const changed = await startNextRound(matchId, now)
      if (!changed) return
      continue
    }

    return
  }
}

function isOnlineLite(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() <= DUAL_DISCONNECT_GRACE_MS
}

async function startCountdown(matchId: string): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match || match.status !== 'WAITING') return false
    if (!match.players.every((player) => player.ready)) return false

    const now = new Date()
    const updated = await tx.dualMatch.updateMany({
      where: { id: matchId, status: 'WAITING' },
      data: {
        status: 'COUNTDOWN',
        startsAt: new Date(now.getTime() + DUAL_COUNTDOWN_MS),
        readyDeadlineAt: null,
      },
    })
    return updated.count === 1
  })
}

async function startRunning(matchId: string): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match || match.status !== 'COUNTDOWN' || !match.startsAt) return false

    const now = new Date()
    if (match.players.some((player) => !isOnline(player, now))) {
      await cancelWithinTx(tx, match, 'A player disconnected before launch.', now)
      return true
    }

    const crashX100 = match.crashMultiplierX100
    if (crashX100 == null) return false
    const crashAt = new Date(
      match.startsAt.getTime() + elapsedMsForMultiplierX100(crashX100),
    )

    const updated = await tx.dualMatch.updateMany({
      where: { id: matchId, status: 'COUNTDOWN' },
      data: { status: 'RUNNING', crashAt },
    })
    return updated.count === 1
  })
}

async function finalizeRound(matchId: string, now: Date): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match || match.status !== 'RUNNING') return false
    if (!match.crashAt || now.getTime() < match.crashAt.getTime()) return false

    const cashed = match.players.filter((player) => player.cashoutAt != null)
    if (cashed.length === 0) {
      return intermissionWithinTx(tx, match, now)
    }

    const winner = latestCashout(match.players)
    if (!winner) return false
    return settleWithinTx(tx, match, winner, now)
  })
}

async function intermissionWithinTx(
  tx: Tx,
  match: MatchWithPlayers,
  now: Date,
): Promise<boolean> {
  const crashX100 = match.crashMultiplierX100
  if (crashX100 == null) return false

  const claimed = await tx.dualMatch.updateMany({
    where: { id: match.id, status: 'RUNNING' },
    data: { status: 'SETTLING' },
  })
  if (claimed.count !== 1) return false

  const history = toJsonHistory(match.roundHistory)
  history.push({
    round: match.round,
    nonce: match.nonce,
    serverSeed: match.serverSeed,
    serverSeedHash: match.serverSeedHash,
    crashMultiplierX100: crashX100,
    clientSeeds: match.players.map((player) => player.clientSeed),
    cashouts: [],
    endedAt: now.toISOString(),
  })

  await tx.dualMatch.update({
    where: { id: match.id },
    data: {
      status: 'INTERMISSION',
      replayCount: { increment: 1 },
      intermissionEndsAt: new Date(now.getTime() + DUAL_INTERMISSION_MS),
      roundHistory: history as unknown as Prisma.InputJsonValue,
      endedAt: null,
    },
  })

  return true
}

async function startNextRound(matchId: string, now: Date): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match || match.status !== 'INTERMISSION') return false

    if (match.players.some((player) => !isOnline(player, now))) {
      await cancelWithinTx(tx, match, 'A player left during the replay intermission.', now)
      return true
    }

    const serverSeed = generateServerSeed()
    const serverSeedHash = hashServerSeed(serverSeed)
    const nonce = match.nonce + 1
    const clientSeeds = match.players.map((player) => player.clientSeed)
    const crash = makeFreshRound(serverSeed, clientSeeds, nonce)

    const updated = await tx.dualMatch.updateMany({
      where: { id: matchId, status: 'INTERMISSION' },
      data: {
        status: 'COUNTDOWN',
        round: { increment: 1 },
        nonce,
        serverSeed,
        serverSeedHash,
        crashMultiplierX100: crash.crashMultiplierX100,
        crashAt: null,
        startsAt: new Date(now.getTime() + DUAL_COUNTDOWN_MS),
        intermissionEndsAt: null,
        readyDeadlineAt: null,
        endedAt: null,
      },
    })
    if (updated.count !== 1) return false

    await tx.dualMatchPlayer.updateMany({
      where: { matchId },
      data: {
        ready: true,
        lastSeenAt: now,
        cashoutAt: null,
        cashoutMultiplierX100: null,
        payoutPusd: 0n,
      },
    })

    return true
  })
}

// ── settlement / refunds ────────────────────────────────────

async function settleWithinTx(
  tx: Tx,
  match: MatchWithPlayers,
  winner: PlayerWithUser,
  now: Date,
): Promise<boolean> {
  const claimed = await tx.dualMatch.updateMany({
    where: { id: match.id, status: 'RUNNING' },
    data: { status: 'SETTLING' },
  })
  if (claimed.count !== 1) return false

  const { feePusd, payoutPusd } = projectedPayoutPusd(match.potPusd)

  await tx.user.update({
    where: { id: winner.userId },
    data: { balancePusd: { increment: payoutPusd } },
  })

  await recordLedger(tx, {
    userId: winner.userId,
    kind: 'WIN',
    amountPusd: payoutPusd,
    reference: `dual:payout:${match.id}`,
    metadata: {
      matchId: match.id,
      round: match.round,
      potPusd: match.potPusd.toString(),
      feePusd: feePusd.toString(),
      stakePusd: match.stakePusd.toString(),
      winnerMultiplierX100: winner.cashoutMultiplierX100 ?? null,
    },
  })

  await tx.dualMatchPlayer.updateMany({
    where: { matchId: match.id },
    data: { payoutPusd: 0n },
  })
  await tx.dualMatchPlayer.update({
    where: { id: winner.id },
    data: { payoutPusd },
  })

  await tx.dualMatch.update({
    where: { id: match.id },
    data: {
      status: 'SETTLED',
      winnerUserId: winner.userId,
      feePusd,
      payoutPusd,
      endedAt: now,
    },
  })

  // Settled matches stay pinned on User.activeMatchId so the result/rematch
  // screen survives a refresh. `leaveMatch` or joining a new queue clears it.
  return true
}

async function cancelWithinTx(
  tx: Tx,
  match: MatchWithPlayers,
  reason: string,
  now: Date,
): Promise<boolean> {
  const status = statusOf(match)
  if (!CANCELLABLE.has(status)) return false

  const claimed = await tx.dualMatch.updateMany({
    where: { id: match.id, status },
    data: {
      status: 'CANCELLED',
      endedAt: now,
      feePusd: 0n,
      payoutPusd: 0n,
      winnerUserId: null,
      disputeReason: match.disputed ? match.disputeReason : reason,
    },
  })
  if (claimed.count !== 1) return false

  for (const player of match.players) {
    await tx.user.update({
      where: { id: player.userId },
      data: { balancePusd: { increment: player.stakePusd } },
    })
    await recordLedger(tx, {
      userId: player.userId,
      kind: 'ADJUSTMENT',
      amountPusd: player.stakePusd,
      reference: `dual:refund:${match.id}:${player.userId}`,
      metadata: {
        matchId: match.id,
        reason,
        stakePusd: player.stakePusd.toString(),
      },
    })
  }

  // Keep the cancelled match pinned for the result screen. `leaveMatch`, or
  // joining a new queue, clears User.activeMatchId.

  return true
}

export async function cancelMatch(matchId: string, reason: string): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) return false
    return cancelWithinTx(tx, match, reason, new Date())
  })
}

export async function cancelMatchAsPlayer(matchId: string, userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (!match.players.some((player) => player.userId === userId)) {
      throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    }
    if (match.status === 'RUNNING') {
      throw new DualError('You cannot cancel once the rocket has launched.', 409, 'ALREADY_RUNNING')
    }
    if (TERMINAL.has(statusOf(match))) return
    await cancelWithinTx(tx, match, 'Cancelled by a player.', new Date())
  })
}

// ── rematch / leave ─────────────────────────────────────────

export async function requestRematch(matchId: string, userId: string): Promise<{ matchId: string | null }> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (match.status !== 'SETTLED') {
      throw new DualError('A rematch is only available after a settled round.', 409, 'NOT_SETTLED')
    }
    if (match.rematchCreatedAt) {
      throw new DualError('The rematch is already starting.', 409, 'REMATCH_ALREADY_CREATED')
    }
    const self = match.players.find((player) => player.userId === userId)
    if (!self) throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')

    const now = new Date()
    await tx.dualMatchPlayer.update({
      where: { id: self.id },
      data: { rematchRequested: true, rematchRequestedAt: now },
    })
    await tx.dualMatch.update({
      where: { id: matchId },
      data: { rematchDeclinedAt: null },
    })

    const bothRequested = match.players.every(
      (player) => player.userId === userId || player.rematchRequested,
    )
    if (!bothRequested) return { matchId: null }

    // Re-lock both stakes for the rematch.
    for (const player of match.players) {
      const debited = await tx.user.updateMany({
        where: { id: player.userId, balancePusd: { gte: match.stakePusd } },
        data: { balancePusd: { decrement: match.stakePusd } },
      })
      if (debited.count !== 1) {
        throw new DualError(
          'Both players need enough PUSD for the rematch. Try again after topping up.',
          409,
          'INSUFFICIENT_BALANCE',
        )
      }
    }

    const entries = await Promise.all(
      match.players.map(async (player) => ({
        userId: player.userId,
        clientSeed: await ensureClientSeed(tx, player.userId),
        stakePusd: match.stakePusd,
      })),
    )

    const rematch = await createMatchWithinTx(tx, entries, match.id)
    await tx.dualMatch.update({
      where: { id: matchId },
      data: { rematchCreatedAt: now },
    })

    for (const entry of entries) {
      await recordLedger(tx, {
        userId: entry.userId,
        kind: 'BET',
        amountPusd: -match.stakePusd,
        reference: `dual:bet:${rematch.id}:${entry.userId}`,
        metadata: { matchId: rematch.id, rematchOf: match.id, stakePusd: match.stakePusd.toString() },
      })
    }

    return { matchId: rematch.id }
  })
}

export async function declineRematch(matchId: string, userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (!match.players.some((player) => player.userId === userId)) {
      throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    }
    await tx.dualMatchPlayer.updateMany({
      where: { matchId, userId },
      data: { rematchRequested: false, rematchRequestedAt: null },
    })
    await tx.dualMatch.update({
      where: { id: matchId },
      data: { rematchDeclinedAt: new Date() },
    })
  })
}

export async function leaveMatch(matchId: string, userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (!match.players.some((player) => player.userId === userId)) {
      throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    }

    const status = statusOf(match)
    if (status === 'RUNNING') {
      throw new DualError('You cannot leave while the rocket is flying.', 409, 'ALREADY_RUNNING')
    }
    if (CANCELLABLE.has(status)) {
      await cancelWithinTx(tx, match, 'A player left the match.', new Date())
      return
    }
    if (!TERMINAL.has(status)) return

    await tx.user.updateMany({
      where: { id: userId, activeMatchId: match.id },
      data: { activeMatchId: null },
    })
    await tx.dualMatchPlayer.updateMany({
      where: { matchId, userId },
      data: { rematchRequested: false, rematchRequestedAt: null },
    })
    if (status === 'SETTLED' && !match.rematchDeclinedAt) {
      await tx.dualMatch.update({
        where: { id: matchId },
        data: { rematchDeclinedAt: new Date() },
      })
    }
  })
}

// ── disputes / verification ─────────────────────────────────

export async function disputeMatch(
  matchId: string,
  userId: string,
  reason: string,
): Promise<{ cancelled: boolean }> {
  const trimmed = reason.trim().slice(0, DUAL_MAX_DISPUTE_REASON_LENGTH)
  if (trimmed.length < 3) {
    throw new DualError('Describe the problem in a few words.', 400, 'REASON_REQUIRED')
  }

  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
    if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')
    if (!match.players.some((player) => player.userId === userId)) {
      throw new DualError('You are not in this match.', 403, 'NOT_A_PLAYER')
    }

    if (CANCELLABLE.has(statusOf(match))) {
      const cancelled = await cancelWithinTx(tx, match, `Disputed: ${trimmed}`, new Date())
      return { cancelled }
    }

    await tx.dualMatch.update({
      where: { id: matchId },
      data: {
        disputed: true,
        disputeReason: trimmed,
        disputeAt: new Date(),
      },
    })
    return { cancelled: false }
  })
}

export async function verifyMatch(
  matchId: string,
  round?: number,
): Promise<DualVerifyResponse> {
  const match = await prisma.dualMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })
  if (!match) throw new DualError('Match not found.', 404, 'MATCH_NOT_FOUND')

  const history = toJsonHistory(match.roundHistory)
  const isCurrentRound = round == null || round === match.round
  const historyEntry = isCurrentRound ? null : history.find((entry) => entry.round === round)
  if (!isCurrentRound && !historyEntry) {
    throw new DualError('Round not found.', 404, 'ROUND_NOT_FOUND')
  }

  const status = statusOf(match)
  const canReveal = historyEntry != null || revealed(status)
  const serverSeed = historyEntry?.serverSeed ?? match.serverSeed
  const serverSeedHash = historyEntry?.serverSeedHash ?? match.serverSeedHash
  const nonce = historyEntry?.nonce ?? match.nonce
  const clientSeeds =
    historyEntry?.clientSeeds ?? match.players.map((player) => player.clientSeed)
  const storedCrash = historyEntry?.crashMultiplierX100 ?? match.crashMultiplierX100

  const hashMatches = hashServerSeed(serverSeed) === serverSeedHash
  let computed: CrashResult | null = null
  if (canReveal) {
    computed = computeCrash(serverSeed, clientSeeds, nonce)
  }

  const crashMatches =
    computed && storedCrash != null ? computed.crashMultiplierX100 === storedCrash : null

  if (canReveal && (!hashMatches || crashMatches === false)) {
    await prisma.dualMatch.update({
      where: { id: matchId },
      data: { integrityOk: false, disputed: true },
    }).catch(() => undefined)
  }

  return {
    matchId,
    round: historyEntry?.round ?? match.round,
    nonce: canReveal ? nonce : null,
    serverSeedHash,
    serverSeed: canReveal ? serverSeed : null,
    clientSeeds: canReveal ? clientSeeds : [],
    hmacHex: computed?.hmacHex ?? null,
    uniform: computed?.uniform ?? null,
    expectedCrashMultiplierX100: computed?.crashMultiplierX100 ?? null,
    storedCrashMultiplierX100: canReveal ? storedCrash : null,
    hashMatches: canReveal ? hashMatches : null,
    crashMatches: canReveal ? crashMatches : null,
    revealed: canReveal,
    note: canReveal
      ? 'Recompute HMAC-SHA256(serverSeed, sorted client seeds + nonce). The first 8 hex chars give the crash point.'
      : 'The server seed and crash point are revealed when the round ends.',
  }
}

// ── history ─────────────────────────────────────────────────

export async function getHistory(userId: string, limit = 20): Promise<DualHistoryItem[]> {
  const rows = await prisma.dualMatchPlayer.findMany({
    where: {
      userId,
      match: { status: { in: ['SETTLED', 'CANCELLED'] } },
    },
    orderBy: { match: { createdAt: 'desc' } },
    take: Math.min(Math.max(limit, 1), 50),
    include: {
      match: {
        include: {
          winner: { select: { displayName: true } },
          _count: { select: { players: true } },
        },
      },
    },
  })

  return rows.map((row) => {
    const match = row.match
    return {
      id: match.id,
      status: match.status as DualStatus,
      stakePusd: formatPusdUnits(match.stakePusd),
      potPusd: formatPusdUnits(match.potPusd),
      feePusd: formatPusdUnits(match.feePusd),
      payoutPusd: formatPusdUnits(match.payoutPusd),
      winnerUserId: match.winnerUserId,
      winnerDisplayName: match.winner?.displayName ?? null,
      didWin: match.winnerUserId === userId,
      round: match.round,
      replayCount: match.replayCount,
      crashMultiplierX100: match.crashMultiplierX100,
      createdAt: match.createdAt.toISOString(),
      endedAt: match.endedAt?.toISOString() ?? null,
      disputed: match.disputed,
      playerCount: match._count.players,
    }
  })
}

// ── client seed ─────────────────────────────────────────────

export async function getClientSeed(userId: string): Promise<string> {
  return runTx(async (tx) => ensureClientSeed(tx, userId))
}

export async function regenerateClientSeed(userId: string): Promise<string> {
  return runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { activeMatchId: true },
    })
    if (!user) throw new DualError('User not found.', 404, 'USER_NOT_FOUND')

    if (user.activeMatchId) {
      const active = await tx.dualMatch.findUnique({
        where: { id: user.activeMatchId },
        select: { status: true },
      })
      if (active && !TERMINAL.has(active.status as DualStatus)) {
        throw new DualError(
          'Your client seed is locked while a match is active.',
          409,
          'SEED_LOCKED',
        )
      }
    }

    const ticket = await tx.dualTicket.findUnique({ where: { userId } })
    if (ticket) {
      throw new DualError('Leave the queue before changing your client seed.', 409, 'SEED_LOCKED')
    }

    const clientSeed = generateClientSeed()
    await tx.user.update({ where: { id: userId }, data: { clientSeed } })
    return clientSeed
  })
}

// ── maintenance ─────────────────────────────────────────────

export async function advanceOpenMatches(limit = 100): Promise<number> {
  const open = await prisma.dualMatch.findMany({
    where: { status: { in: ['WAITING', 'COUNTDOWN', 'RUNNING', 'INTERMISSION'] } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  for (const match of open) {
    await advanceMatch(match.id).catch((error) => {
      console.error('[dual] cron advance failed', match.id, error)
    })
  }

  await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    await expireTicketsWithinTx(tx, new Date())
  })

  return open.length
}
