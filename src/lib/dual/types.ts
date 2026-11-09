/**
 * Shared Dual Crash DTOs. All PUSD amounts are decimal strings so the payload
 * is JSON-safe and readable in devtools.
 */

export type DualStatus =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'RUNNING'
  | 'SETTLING'
  | 'SETTLED'
  | 'INTERMISSION'
  | 'CANCELLED'

export type DualPlayerView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  seat: number
  isSelf: boolean
  stakePusd: string
  ready: boolean
  online: boolean
  /** Only true/known while the viewer is allowed to see the result. */
  cashedOut: boolean
  cashoutMultiplierX100: number | null
  payoutPusd: string
  rematchRequested: boolean
}

export type DualViewer = {
  isPlayer: boolean
  hasCashedOut: boolean
  cashoutMultiplierX100: number | null
  canCashOut: boolean
  canCancel: boolean
  canRematch: boolean
  canLeave: boolean
}

export type DualMatchView = {
  id: string
  status: DualStatus
  round: number
  replayCount: number
  stakePusd: string
  potPusd: string
  feePusd: string
  payoutPusd: string
  winnerUserId: string | null

  /** Always published before the round starts. */
  serverSeedHash: string
  /** Revealed only after the round ends. */
  serverSeed: string | null
  nonce: number | null
  crashMultiplierX100: number | null

  startsAt: string | null
  /** Server crash instant. Hidden while the round is running. */
  crashAt: string | null
  intermissionEndsAt: string | null
  readyDeadlineAt: string | null
  endedAt: string | null
  serverNow: string

  currentMultiplierX100: number
  countdownMsRemaining: number | null

  players: DualPlayerView[]
  viewer: DualViewer

  rematchDeclined: boolean
  disputed: boolean
  disputeReason: string | null
  /** True when the match was voided and both stakes returned. */
  refunded: boolean
}

export type DualQueueView = {
  stakePusd: string
  expiresAt: string
}

export type DualStateResponse = {
  serverNow: string
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    balancePusd: string
    clientSeed: string
  }
  queue: DualQueueView | null
  match: DualMatchView | null
}

export type DualHistoryItem = {
  id: string
  status: DualStatus
  stakePusd: string
  potPusd: string
  feePusd: string
  payoutPusd: string
  winnerUserId: string | null
  winnerDisplayName: string | null
  didWin: boolean
  round: number
  replayCount: number
  crashMultiplierX100: number | null
  createdAt: string
  endedAt: string | null
  disputed: boolean
  playerCount: number
}

export type DualVerifyResponse = {
  matchId: string
  round: number
  nonce: number | null
  serverSeedHash: string
  serverSeed: string | null
  clientSeeds: string[]
  hmacHex: string | null
  uniform: number | null
  expectedCrashMultiplierX100: number | null
  storedCrashMultiplierX100: number | null
  hashMatches: boolean | null
  crashMatches: boolean | null
  revealed: boolean
  note: string
}
