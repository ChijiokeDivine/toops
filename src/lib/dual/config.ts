/**
 * Dual Crash configuration. Safe to import from client components.
 *
 * All amounts are PUSD base units (2 decimals): 200n = 2.00 PUSD.
 * Multipliers are integer hundredths: 234 = 2.34x.
 */

export const DUAL_DEFAULT_STAKE_PUSD = 200n
export const DUAL_MIN_STAKE_PUSD = 100n
export const DUAL_MAX_STAKE_PUSD = 100_000n

/** Preset stakes shown in the picker. */
export const DUAL_STAKE_PRESETS = [
  { amountPusd: 100n, label: '1' },
  { amountPusd: 500n, label: '5' },
  { amountPusd: 1_000n, label: '10' },
  { amountPusd: 2_500n, label: '25' },
  { amountPusd: 5_000n, label: '50' },
] as const

/** 1% platform fee, in basis points of the pot. */
export const DUAL_FEE_BPS = 100n
export const DUAL_FEE_DIVISOR = 10_000n

/** Hard cap: 100,000.00x. */
export const DUAL_MAX_MULTIPLIER_X100 = 10_000_000
/** Prevent instant no-play rounds; the fair formula can still produce 1.00x. */
export const DUAL_MIN_MULTIPLIER_X100 = 101

/** Exponential rocket curve: m(t) = e^(k * seconds). */
export const DUAL_GROWTH_RATE_PER_SECOND = 0.22

/** Both players must load before stakes are put at risk. */
export const DUAL_READY_TIMEOUT_MS = 60_000
/** Once both are ready, the rocket launches after this. */
export const DUAL_COUNTDOWN_MS = 6_000
/**
 * How long a player may go without a heartbeat before the server treats them as
 * gone. Kept generous on purpose: a slow database, a retried request or a
 * background browser tab can easily delay a poll by several seconds, and
 * refunding a match that is still alive is worse than waiting a little longer.
 */
export const DUAL_DISCONNECT_GRACE_MS = 20_000
/**
 * If a player is still missing when the countdown expires, hold the launch and
 * wait this long for them before refunding. The countdown restarts each time we
 * see them again, so the round only launches once both clients are present.
 */
export const DUAL_LAUNCH_HOLD_MS = 45_000
/** How long the crash result is shown before an automatic both-bust replay. */
export const DUAL_INTERMISSION_MS = 6_000
/** A queued ticket is refunded after this long without a match. */
export const DUAL_QUEUE_TTL_MS = 5 * 60_000

/** Client polling cadence. */
export const DUAL_POLL_RUNNING_MS = 400
export const DUAL_POLL_IDLE_MS = 1_000
/** Independent presence ping cadence while a match is open. */
export const DUAL_HEARTBEAT_MS = 4_000

export const DUAL_MAX_DISPUTE_REASON_LENGTH = 500
