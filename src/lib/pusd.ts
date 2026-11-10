/**
 * PUSD helpers. PUSD is ParyonUSD, a 2-decimal CashToken, so one PUSD is
 * 100 base units. The ledger stores base units; chain transfers use the same
 * units as the CashToken fungible amount.
 *
 * This module is pure and safe to import from client components.
 */

export const PUSD_SYMBOL = 'PUSD'
export const PUSD_DECIMALS = 2
export const PUSD_BASE_UNITS_PER_PUSD = 10n ** BigInt(PUSD_DECIMALS)

/** Converts satoshis to PUSD base units using a sats-per-PUSD rate, rounding down. */
export function satsToPusdUnits(sats: bigint, satsPerPusd: bigint): bigint {
  if (satsPerPusd <= 0n) throw new Error('PUSD rate must be positive')
  if (sats <= 0n) return 0n
  return (sats * PUSD_BASE_UNITS_PER_PUSD) / satsPerPusd
}

/** Like {@link satsToPusdUnits}, but rounds up (use for fees/charges). */
export function satsToPusdUnitsCeil(sats: bigint, satsPerPusd: bigint): bigint {
  if (satsPerPusd <= 0n) throw new Error('PUSD rate must be positive')
  if (sats <= 0n) return 0n
  const numerator = sats * PUSD_BASE_UNITS_PER_PUSD
  return (numerator + satsPerPusd - 1n) / satsPerPusd
}

/** Converts PUSD base units to satoshis, rounding down. */
export function pusdUnitsToSats(units: bigint, satsPerPusd: bigint): bigint {
  if (satsPerPusd <= 0n) throw new Error('PUSD rate must be positive')
  if (units <= 0n) return 0n
  return (units * satsPerPusd) / PUSD_BASE_UNITS_PER_PUSD
}

/** Formats base units as a fixed 2-decimal string, e.g. `1234n` -> `"12.34"`. */
export function formatPusdUnits(units: bigint): string {
  const negative = units < 0n
  const absolute = negative ? -units : units
  const whole = absolute / PUSD_BASE_UNITS_PER_PUSD
  const fraction = (absolute % PUSD_BASE_UNITS_PER_PUSD).toString().padStart(PUSD_DECIMALS, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function formatSatsAsPusd(sats: bigint, satsPerPusd: bigint): string {
  return formatPusdUnits(satsToPusdUnits(sats, satsPerPusd))
}

/**
 * Parses a user-entered PUSD amount (`"1"`, `"1.5"`, `"0.05"`) into base units.
 * Returns `null` for zero, negative, malformed, or over-precise input.
 */
export function parsePusdInput(input: string): bigint | null {
  const trimmed = input.trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!match) return null

  const whole = BigInt(match[1] ?? '0')
  const fraction = BigInt((match[2] ?? '').padEnd(PUSD_DECIMALS, '0'))
  const units = whole * PUSD_BASE_UNITS_PER_PUSD + fraction
  return units > 0n ? units : null
}

export type PayoutAsset = 'PUSD' | 'BCH'

export function parsePayoutAsset(value: unknown): PayoutAsset | null {
  return value === 'PUSD' || value === 'BCH' ? value : null
}
