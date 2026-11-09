'use client'

import { useEffect, useState } from 'react'
import type { DualHistoryItem } from '@/lib/dual/types'
import { formatMultiplier } from '@/lib/dual/curve'
import { usd } from './format'

type HistoryPayload = { matches?: DualHistoryItem[]; error?: string }

export function HistoryPanel({ refreshKey }: { refreshKey: string }) {
  const [matches, setMatches] = useState<DualHistoryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/dual/history?limit=6', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = (await response.json()) as HistoryPayload
        if (!cancelled) setMatches(data.matches ?? [])
      } catch {
        // History is a nice-to-have; ignore transient failures.
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshKey])

  if (!matches || matches.length === 0) return null

  return (
    <section className="dual-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Your last rounds</h2>
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
          {matches.length} recent
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] gap-2 bg-white/[0.04] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--t-muted)]">
          <span>Result</span>
          <span className="text-right">Stake</span>
          <span className="text-right">Crash</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Fee</span>
        </div>
        {matches.map((match) => {
          const refunded = match.status === 'CANCELLED'
          const label = refunded ? 'Refunded' : match.didWin ? 'Won' : 'Lost'
          const tone = refunded
            ? 'text-white/55'
            : match.didWin
              ? 'text-[#ffdf1a]'
              : 'text-[#ff8a9a]'
          return (
            <div
              key={match.id}
              className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] gap-2 border-t border-white/[0.04] px-3 py-2 text-[11px] tabular-nums"
            >
              <span className={`font-semibold ${tone}`}>
                {label}
                {match.replayCount > 0 ? (
                  <span className="ml-1 text-[9px] font-normal text-white/35">R{match.replayCount}</span>
                ) : null}
              </span>
              <span className="text-right text-white/65">{usd(match.stakePusd)}</span>
              <span className="text-right text-white/65">
                {match.crashMultiplierX100 != null
                  ? formatMultiplier(match.crashMultiplierX100)
                  : '—'}
              </span>
              <span className="text-right text-[#00fa7f]">
                {match.didWin ? usd(match.payoutPusd) : refunded ? usd(match.stakePusd) : '—'}
              </span>
              <span className="text-right text-white/45">{usd(match.feePusd)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
