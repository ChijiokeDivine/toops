import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/** XP awarded for the first claim of a streak. */
export const DAILY_XP_BASE = 100
/** Extra XP per consecutive day, after the first. */
export const DAILY_XP_STREAK_BONUS = 25
/** Number of consecutive days that can add a bonus. */
export const DAILY_XP_BONUS_DAYS = 6
/** XP needed to move up one level. */
export const XP_PER_LEVEL = 500

const DAY_MS = 24 * 60 * 60 * 1000

export class XpError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'XpError'
    this.status = status
  }
}

/** UTC calendar day for daily claims, e.g. `2026-11-05`. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function xpClaimAmount(streak: number): number {
  const bonusDays = Math.min(Math.max(streak - 1, 0), DAILY_XP_BONUS_DAYS)
  return DAILY_XP_BASE + bonusDays * DAILY_XP_STREAK_BONUS
}

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function levelProgress(xp: number): {
  level: number
  intoLevel: number
  needed: number
  percent: number
} {
  const level = levelForXp(xp)
  const intoLevel = xp % XP_PER_LEVEL
  return {
    level,
    intoLevel,
    needed: XP_PER_LEVEL - intoLevel,
    percent: Math.round((intoLevel / XP_PER_LEVEL) * 100),
  }
}

/** Midnight UTC after `date` — when the next daily claim becomes available. */
export function nextUtcMidnight(date: Date): Date {
  const next = new Date(date)
  next.setUTCHours(24, 0, 0, 0)
  return next
}

export type XpClaimRecord = {
  id: string
  amount: number
  streak: number
  dayKey: string
  createdAt: Date
}

export type XpSummary = {
  xp: number
  /** Current streak, or 0 when more than one UTC day was missed. */
  streak: number
  bestStreak: number
  totalClaims: number
  totalClaimed: number
  canClaim: boolean
  /** XP the next claim will award (base + any streak bonus). */
  claimAmount: number
  lastClaimedAt: Date | null
  /** When the next claim unlocks; only set when today's claim is done. */
  nextClaimAt: Date | null
  claims: XpClaimRecord[]
  level: number
  levelProgress: {
    level: number
    intoLevel: number
    needed: number
    percent: number
  }
}

export async function getXpSummary(userId: string): Promise<XpSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, xpStreak: true, xpLastClaimedAt: true },
  })
  if (!user) return null

  const [claims, totalClaims, totals] = await Promise.all([
    prisma.xpClaim.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, amount: true, streak: true, dayKey: true, createdAt: true },
    }),
    prisma.xpClaim.count({ where: { userId } }),
    prisma.xpClaim.aggregate({ where: { userId }, _sum: { amount: true }, _max: { streak: true } }),
  ])

  const now = new Date()
  const todayKey = utcDayKey(now)
  const yesterdayKey = utcDayKey(new Date(now.getTime() - DAY_MS))
  const lastKey = user.xpLastClaimedAt ? utcDayKey(user.xpLastClaimedAt) : null

  const claimedToday = lastKey === todayKey
  const streakIsAlive = lastKey === todayKey || lastKey === yesterdayKey
  const streak = streakIsAlive ? user.xpStreak : 0
  const nextStreak = lastKey === yesterdayKey ? user.xpStreak + 1 : 1

  return {
    xp: user.xp,
    streak,
    bestStreak: totals._max.streak ?? 0,
    totalClaims,
    totalClaimed: totals._sum.amount ?? 0,
    canClaim: !claimedToday,
    claimAmount: xpClaimAmount(nextStreak),
    lastClaimedAt: user.xpLastClaimedAt,
    nextClaimAt: claimedToday ? nextUtcMidnight(now) : null,
    claims,
    level: levelForXp(user.xp),
    levelProgress: levelProgress(user.xp),
  }
}

/**
 * Atomically claims today's XP. The `(userId, dayKey)` unique index is the
 * database-level guard against concurrent double claims.
 */
export async function claimDailyXp(userId: string): Promise<{ amount: number; streak: number }> {
  const now = new Date()
  const todayKey = utcDayKey(now)
  const yesterdayKey = utcDayKey(new Date(now.getTime() - DAY_MS))

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { xpStreak: true, xpLastClaimedAt: true },
      })
      if (!user) {
        throw new XpError('Your account could not be found.', 404)
      }

      const lastKey = user.xpLastClaimedAt ? utcDayKey(user.xpLastClaimedAt) : null
      if (lastKey === todayKey) {
        throw new XpError('You already claimed your XP today. Come back tomorrow.', 409)
      }

      const streak = lastKey === yesterdayKey ? user.xpStreak + 1 : 1
      const amount = xpClaimAmount(streak)

      await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: amount },
          xpStreak: streak,
          xpLastClaimedAt: now,
        },
      })
      await tx.xpClaim.create({
        data: { userId, amount, streak, dayKey: todayKey },
      })

      return { amount, streak }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new XpError('You already claimed your XP today. Come back tomorrow.', 409)
    }
    throw error
  }
}
