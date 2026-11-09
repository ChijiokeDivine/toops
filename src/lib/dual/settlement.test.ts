import { describe, expect, it } from 'vitest'
import { calculateFeePusd, projectedPayoutPusd } from './settlement'

describe('Dual Crash settlement', () => {
  it('takes 1% of the pot and pays the rest to the winner', () => {
    // $10 + $10 = $20 pot -> $0.20 fee -> $19.80 payout.
    expect(projectedPayoutPusd(2_000n)).toEqual({
      feePusd: 20n,
      payoutPusd: 1_980n,
    })
  })

  it('works for the $1 preset', () => {
    expect(projectedPayoutPusd(200n)).toEqual({
      feePusd: 2n,
      payoutPusd: 198n,
    })
  })

  it('floors the fee to a whole base unit', () => {
    // $2.99 pot -> 2.99% of a base unit, floored to 2.
    expect(calculateFeePusd(299n)).toBe(2n)
    expect(projectedPayoutPusd(299n)).toEqual({
      feePusd: 2n,
      payoutPusd: 297n,
    })
  })

  it('never creates a negative payout', () => {
    expect(projectedPayoutPusd(0n)).toEqual({ feePusd: 0n, payoutPusd: 0n })
  })
})
