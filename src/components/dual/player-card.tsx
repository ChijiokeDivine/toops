'use client'

import type { DualPlayerView, DualStatus } from '@/lib/dual/types'
import { formatMultiplier } from '@/lib/dual/curve'
import { initials, usd } from './format'

type PlayerCardProps = {
  player: DualPlayerView
  status: DualStatus
  winnerUserId: string | null
}

function statusText(player: DualPlayerView, status: DualStatus, isWinner: boolean): string {
  if (status === 'CANCELLED') return 'Stake refunded'
  if (status === 'SETTLED') {
    if (isWinner) {
      return `Winner · ${usd(player.payoutPusd)}`
    }
    return player.cashedOut ? 'Cashed out too early' : 'Busted'
  }
  if (status === 'INTERMISSION') return 'Busted'
  if (status === 'RUNNING') {
    if (player.cashedOut && player.cashoutMultiplierX100 != null) {
      return `Cashed out at ${formatMultiplier(player.cashoutMultiplierX100)}`
    }
    return 'In play'
  }
  if (status === 'COUNTDOWN') return 'Ready for launch'
  if (status === 'WAITING') return player.ready ? 'Ready' : 'Loading…'
  return 'Waiting'
}

export function PlayerCard({ player, status, winnerUserId }: PlayerCardProps) {
  const isWinner = status === 'SETTLED' && winnerUserId === player.userId
  const isActive =
    status === 'RUNNING' && !player.cashedOut
      ? true
      : status === 'COUNTDOWN' || status === 'WAITING'

  return (
    <div
      className={`dual-player-card relative overflow-hidden rounded-2xl border p-3 transition-all ${
        isWinner
          ? 'border-[#ffdf1a]/55 bg-[#ffdf1a]/[0.07] shadow-[0_0_34px_rgba(255,223,26,0.12)]'
          : player.isSelf
            ? 'border-[#00fa7f]/25 bg-[#00fa7f]/[0.045]'
            : 'border-white/[0.07] bg-white/[0.025]'
      }`}
    >
      {isWinner ? <span className="dual-winner-shine" aria-hidden="true" /> : null}

      <div className="relative flex items-center gap-2.5">
        <div className="relative">
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-[#1b2a44] to-[#101827] text-sm font-bold text-white/80">
              {initials(player.displayName)}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b111c] ${
              player.online ? 'bg-[#00fa7f]' : 'bg-[#596276]'
            }`}
            title={player.online ? 'Online' : 'Offline'}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-white">{player.displayName}</p>
            {player.isSelf ? (
              <span className="rounded bg-[#00fa7f]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#00fa7f]">
                You
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--t-muted)]">{usd(player.stakePusd)} stake</p>
        </div>

        {player.rematchRequested && status === 'SETTLED' ? (
          <span className="shrink-0 rounded-full border border-[#ffdf1a]/30 bg-[#ffdf1a]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#ffdf1a]">
            Rematch
          </span>
        ) : null}
      </div>

      <div className="relative mt-3 flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isWinner
              ? 'bg-[#ffdf1a]'
              : player.cashedOut && status !== 'SETTLED'
                ? 'bg-[#00fa7f]'
                : isActive
                  ? 'dual-live-dot bg-[#00fa7f]'
                  : 'bg-white/25'
          }`}
        />
        <span
          className={`text-[11px] font-medium ${
            isWinner
              ? 'text-[#ffdf1a]'
              : player.cashedOut && status === 'SETTLED'
                ? 'text-white/55'
                : 'text-white/70'
          }`}
        >
          {statusText(player, status, isWinner)}
        </span>
      </div>
    </div>
  )
}
