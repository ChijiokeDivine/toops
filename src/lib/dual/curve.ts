/**
 * Rocket curve helpers. Pure and client-safe so the browser can animate the
 * multiplier between server polls using only `startsAt` + `serverNow`.
 */

import { DUAL_GROWTH_RATE_PER_SECOND } from './config'

/** Multiplier (hundredths) at a given elapsed flight time. */
export function multiplierX100AtElapsed(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 100
  const raw = Math.exp(DUAL_GROWTH_RATE_PER_SECOND * (elapsedMs / 1_000)) * 100
  // Tiny epsilon keeps exact powers (2.00x) from flooring to 1.99x.
  return Math.max(100, Math.floor(raw + 1e-6))
}

/** Flight time needed to reach a multiplier (hundredths). */
export function elapsedMsForMultiplierX100(multiplierX100: number): number {
  if (!Number.isFinite(multiplierX100) || multiplierX100 <= 100) return 0
  return Math.max(0, (Math.log(multiplierX100 / 100) / DUAL_GROWTH_RATE_PER_SECOND) * 1_000)
}

/** Formats 234 -> "2.34x". */
export function formatMultiplier(multiplierX100: number): string {
  const whole = Math.floor(multiplierX100 / 100)
  const fraction = Math.abs(multiplierX100 % 100)
    .toString()
    .padStart(2, '0')
  return `${whole.toLocaleString('en-US')}.${fraction}x`
}
