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
        <h2 className="mt-3 text-lg font-bold text-white">Finding an opponent</h2>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#070b13]/70 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#00fa7f]" />
          <span className="text-[12px] font-semibold text-white">{usd(stakePusd)} locked</span>
          <span className="text-white/20">·</span>
          <span className="text-[11px] tabular-nums text-[var(--t-muted)]">
            {formatClock(remaining)}
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
      </div>
    </section>
  )
}
