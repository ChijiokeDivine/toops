import { describe, expect, it } from 'vitest'
import { formatMultiplier, elapsedMsForMultiplierX100, multiplierX100AtElapsed } from './curve'

describe('rocket curve', () => {
  it('starts at 1.00x', () => {
    expect(multiplierX100AtElapsed(0)).toBe(100)
    expect(multiplierX100AtElapsed(-500)).toBe(100)
  })

  it('grows monotonically', () => {
    let previous = 100
    for (const ms of [250, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000]) {
      const current = multiplierX100AtElapsed(ms)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('round-trips a multiplier back to flight time', () => {
    for (const x100 of [150, 200, 234, 500, 1_000, 10_000, 1_000_000]) {
      const elapsed = elapsedMsForMultiplierX100(x100)
      expect(multiplierX100AtElapsed(elapsed)).toBe(x100)
    }
  })

  it('keeps the flight watchable and the cash-out window open', () => {
    // The rocket has to be flown, not teleported: a typical 2.00x round must
    // last long enough to see and to press "cash out".
    expect(elapsedMsForMultiplierX100(200)).toBeGreaterThanOrEqual(8_000)
    expect(elapsedMsForMultiplierX100(110)).toBeGreaterThanOrEqual(1_000)
  })

  it('formats multipliers with two decimals', () => {
    expect(formatMultiplier(100)).toBe('1.00x')
    expect(formatMultiplier(234)).toBe('2.34x')
    expect(formatMultiplier(10_000_000)).toBe('100,000.00x')
  })
})
