'use client'

import { useEffect, useState } from 'react'
import { formatClock, usd } from './format'

type QueuePanelProps = {
  stakePusd: string
  expiresAt: string
  onCancel: () => void
  busy: boolean
}

export function QueuePanel({ stakePusd, expiresAt, onCancel, busy }: QueuePanelProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = Math.max(0, new Date(expiresAt).getTime() - now)

  return (
    <section className="dual-card relative overflow-hidden p-5 sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00fa7f]/10" />
        <div className="dual-radar absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00fa7f]/20" />
        <div className="dual-radar dual-radar-delay absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00fa7f]/30" />
      </div>

      <div className="relative flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00fa7f]/25 bg-[#00fa7f]/10">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-[#00fa7f]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="8.5" opacity="0.45" />
            <circle cx="12" cy="12" r="4.5" opacity="0.7" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="mt-3 text-lg font-bold text-white">Searching for an opponent</h2>
        <p className="mt-1 max-w-sm text-[12px] text-[var(--t-muted)]">
          Looking for a random player staking exactly {usd(stakePusd)}. The round starts as soon as
          you are paired and both players are ready.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#070b13]/70 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#00fa7f]" />
          <span className="text-[12px] font-semibold text-white">{usd(stakePusd)} locked</span>
          <span className="text-white/20">·</span>
          <span className="text-[11px] tabular-nums text-[var(--t-muted)]">
            auto-refund in {formatClock(remaining)}
          </span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="mt-4 h-10 rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 text-[12px] font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Cancel & refund'}
        </button>

        <p className="mt-3 text-[10px] text-[var(--t-muted)]">
          Stake is held in your PUSD balance until a match is found. No fee is charged for waiting
          or cancelling.
        </p>
      </div>
    </section>
  )
}
