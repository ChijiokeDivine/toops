import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { DUAL_MAX_MULTIPLIER_X100, DUAL_MIN_MULTIPLIER_X100 } from './config'

const TWO_POW_32 = 1n << 32n

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

export function generateClientSeed(): string {
  return randomBytes(16).toString('hex')
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

export type CrashResult = {
  /** The HMAC digest used for this round. */
  hmacHex: string
  /** First 8 hex chars interpreted as an unsigned 32-bit integer. */
  uniform: number
  /** Crash point in hundredths, clamped and floored. */
  crashMultiplierX100: number
}

/**
 * Provably-fair crash point.
 *
 * HMAC-SHA256(serverSeed, sortedClientSeeds.join(':') + ':' + nonce)
 * -> first 8 hex chars -> h
 * -> crash = 2^32 / (2^32 - h)
 *
 * Integer math avoids float drift. The result is floored to two decimals,
 * clamped to 1.01x minimum and 100,000x maximum.
 */
export function computeCrash(
  serverSeed: string,
  clientSeeds: string[],
  nonce: number,
): CrashResult {
  const message = `${[...clientSeeds].sort().join(':')}:${nonce}`
  const hmacHex = createHmac('sha256', serverSeed).update(message).digest('hex')
  const uniform = Number.parseInt(hmacHex.slice(0, 8), 16)

  const denominator = TWO_POW_32 - BigInt(uniform)
  let crashMultiplierX100 = Number((TWO_POW_32 * 100n) / denominator)

  if (crashMultiplierX100 < DUAL_MIN_MULTIPLIER_X100) {
    crashMultiplierX100 = DUAL_MIN_MULTIPLIER_X100
  }
  if (crashMultiplierX100 > DUAL_MAX_MULTIPLIER_X100) {
    crashMultiplierX100 = DUAL_MAX_MULTIPLIER_X100
  }

  return { hmacHex, uniform, crashMultiplierX100 }
}
