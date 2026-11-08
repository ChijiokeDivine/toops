import { describe, expect, it } from 'vitest'
import {
  PUSD_BASE_UNITS_PER_PUSD,
  formatPusdUnits,
  parsePayoutAsset,
  parsePusdInput,
  pusdUnitsToSats,
  satsToPusdUnits,
  satsToPusdUnitsCeil,
} from './pusd'

describe('PUSD units', () => {
  it('uses two decimals', () => {
    expect(PUSD_BASE_UNITS_PER_PUSD).toBe(100n)
  })

  it('formats base units as a fixed two-decimal string', () => {
    expect(formatPusdUnits(0n)).toBe('0.00')
    expect(formatPusdUnits(5n)).toBe('0.05')
    expect(formatPusdUnits(1234n)).toBe('12.34')
    expect(formatPusdUnits(-1234n)).toBe('-12.34')
  })

  it('parses user input into base units', () => {
    expect(parsePusdInput('1')).toBe(100n)
    expect(parsePusdInput('1.5')).toBe(150n)
    expect(parsePusdInput('0.05')).toBe(5n)
    expect(parsePusdInput(' 12.34 ')).toBe(1234n)
  })

  it('rejects invalid or over-precise input', () => {
    expect(parsePusdInput('')).toBeNull()
    expect(parsePusdInput('0')).toBeNull()
    expect(parsePusdInput('-1')).toBeNull()
    expect(parsePusdInput('1.234')).toBeNull()
    expect(parsePusdInput('abc')).toBeNull()
  })
})

describe('PUSD rate conversion', () => {
  // One PUSD is worth 250,000 sats (BCH = $400, PUSD = $1).
  const satsPerPusd = 250_000n

  it('converts satoshis to PUSD base units', () => {
    expect(satsToPusdUnits(250_000n, satsPerPusd)).toBe(100n)
    expect(satsToPusdUnits(2_500_000n, satsPerPusd)).toBe(1000n)
    expect(satsToPusdUnits(125_000n, satsPerPusd)).toBe(50n)
  })

  it('rounds fees up and payouts down', () => {
    expect(satsToPusdUnits(1n, satsPerPusd)).toBe(0n)
    expect(satsToPusdUnitsCeil(1n, satsPerPusd)).toBe(1n)
    expect(pusdUnitsToSats(100n, satsPerPusd)).toBe(250_000n)
    expect(pusdUnitsToSats(1n, satsPerPusd)).toBe(2_500n)
  })

  it('rejects a non-positive rate', () => {
    expect(() => satsToPusdUnits(1n, 0n)).toThrow()
    expect(() => pusdUnitsToSats(1n, 0n)).toThrow()
  })
})

describe('parsePayoutAsset', () => {
  it('accepts only the two supported payout assets', () => {
    expect(parsePayoutAsset('PUSD')).toBe('PUSD')
    expect(parsePayoutAsset('BCH')).toBe('BCH')
    expect(parsePayoutAsset('pusd')).toBeNull()
    expect(parsePayoutAsset(undefined)).toBeNull()
  })
})
