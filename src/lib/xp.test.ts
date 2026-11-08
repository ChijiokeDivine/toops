import { describe, expect, it } from 'vitest'
import {
  DAILY_XP_BASE,
  DAILY_XP_STREAK_BONUS,
  XP_PER_LEVEL,
  levelForXp,
  levelProgress,
  nextUtcMidnight,
  utcDayKey,
  xpClaimAmount,
} from './xp'

describe('xp helpers', () => {
  it('formats UTC day keys', () => {
    expect(utcDayKey(new Date('2026-11-05T23:59:59Z'))).toBe('2026-11-05')
    expect(utcDayKey(new Date('2026-11-06T00:00:00Z'))).toBe('2026-11-06')
  })

  it('adds a capped streak bonus', () => {
    expect(xpClaimAmount(1)).toBe(DAILY_XP_BASE)
    expect(xpClaimAmount(2)).toBe(DAILY_XP_BASE + DAILY_XP_STREAK_BONUS)
    expect(xpClaimAmount(7)).toBe(DAILY_XP_BASE + 6 * DAILY_XP_STREAK_BONUS)
    expect(xpClaimAmount(30)).toBe(DAILY_XP_BASE + 6 * DAILY_XP_STREAK_BONUS)
  })

  it('derives levels from XP', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(XP_PER_LEVEL - 1)).toBe(1)
    expect(levelForXp(XP_PER_LEVEL)).toBe(2)
  })

  it('reports progress within the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, intoLevel: 0, needed: XP_PER_LEVEL, percent: 0 })
    expect(levelProgress(XP_PER_LEVEL / 2)).toEqual({
      level: 1,
      intoLevel: XP_PER_LEVEL / 2,
      needed: XP_PER_LEVEL / 2,
      percent: 50,
    })
    expect(levelProgress(XP_PER_LEVEL)).toEqual({
      level: 2,
      intoLevel: 0,
      needed: XP_PER_LEVEL,
      percent: 0,
    })
  })

  it('rolls the next claim over at UTC midnight', () => {
    expect(nextUtcMidnight(new Date('2026-11-05T12:34:56Z')).toISOString()).toBe(
      '2026-11-06T00:00:00.000Z',
    )
  })
})
