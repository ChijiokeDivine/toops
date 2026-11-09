import { DUAL_FEE_BPS, DUAL_FEE_DIVISOR } from './config'

/** Platform fee: 1% of the pot, floored to a whole base unit. */
export function calculateFeePusd(potPusd: bigint): bigint {
  return (potPusd * DUAL_FEE_BPS) / DUAL_FEE_DIVISOR
}

/** Splits the pot into the platform fee and the winner's payout. */
export function projectedPayoutPusd(potPusd: bigint): {
  feePusd: bigint
  payoutPusd: bigint
} {
  const feePusd = calculateFeePusd(potPusd)
  return { feePusd, payoutPusd: potPusd - feePusd }
}
