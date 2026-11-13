'use client'

import { useState } from 'react'
import type { DualMatchView, DualVerifyResponse } from '@/lib/dual/types'
import { formatMultiplier } from '@/lib/dual/curve'
import { usd } from './format'

type ResultOverlayProps = {
  match: DualMatchView
  busy: string | null
  onRematch: () => void
  onDecline: () => void
  onLeave: () => void
  onDispute: () => void
}

export function ResultOverlay({
  match,
  busy,
  onRematch,
  onDecline,
  onLeave,
  onDispute,
}: ResultOverlayProps) {
  const [verification, setVerification] = useState<DualVerifyResponse | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  async function verify() {
    setVerifyLoading(true)
    setVerifyError(null)
    try {
      const response = await fetch(
        `/api/dual/verify?matchId=${encodeURIComponent(match.id)}&round=${match.round}`,
        { cache: 'no-store' },
      )
      const data = (await response.json().catch(() => null)) as
        DualVerifyResponse | { error?: string } | null
      if (!response.ok) {
        setVerifyError((data as { error?: string } | null)?.error ?? 'Verification failed.')
        return
      }
      setVerification(data as DualVerifyResponse)
    } catch {
      setVerifyError('Verification failed.')
    } finally {
      setVerifyLoading(false)
    }
  }

  const cancelled = match.status === 'CANCELLED'
  const self = match.players.find((player) => player.isSelf)
  const opponent = match.players.find((player) => !player.isSelf)
  const won = match.status === 'SETTLED' && match.winnerUserId === self?.userId
  const selfRequested = self?.rematchRequested ?? false
  const opponentRequested = opponent?.rematchRequested ?? false
  const declined = match.rematchDeclined

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#050914]/82 p-3 backdrop-blur-md">
      <div className="dual-result-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#0c1320] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        {cancelled ? (
          <div className="p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-white/60"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="mt-3 text-xl font-black text-white">Match cancelled</h3>
            <p className="mt-1 text-[12px] text-[var(--t-muted)]">Stakes refunded.</p>
            {match.disputeReason ? (
              <p className="mx-auto mt-3 max-w-xs rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
                {match.disputeReason}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onLeave}
              disabled={busy != null}
              className="mt-4 h-11 w-full rounded-xl bg-[var(--t-green)] text-[12px] font-black uppercase tracking-[0.12em] text-[var(--t-green-ink)] transition hover:brightness-110 disabled:opacity-50"
            >
              Back to lobby
            </button>
          </div>
        ) : (
          <>
            <div className={`relative overflow-hidden px-5 pb-4 pt-5 text-center ${won ? '' : ''}`}>
              <span className={`absolute inset-x-0 top-0 h-[2px] ${won ? '' : ''}`} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">
                Round {match.round}
                {match.replayCount > 0
                  ? ` · ${match.replayCount} replay${match.replayCount === 1 ? '' : 's'}`
                  : ''}
              </p>
              <h3
                className={`mt-1 text-[26px] font-black ${won ? 'text-[#ffdf1a]' : 'text-white'}`}
              >
                {won ? 'You won' : 'You lost'}
              </h3>
              <p
                className={`mt-1 text-3xl font-black tabular-nums ${won ? 'text-white' : 'text-white/55'}`}
              >
                {won ? usd(match.payoutPusd) : usd('0.00')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--t-muted)]">
                {match.crashMultiplierX100 != null
                  ? `Crashed at ${formatMultiplier(match.crashMultiplierX100)}`
                  : 'Round complete'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px border-y border-white/[0.06] bg-white/[0.05] text-center">
              <div className="bg-[#0c1320] px-2 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">Pot</p>
                <p className="mt-0.5 text-[12px] font-bold tabular-nums text-white">
                  {usd(match.potPusd)}
                </p>
              </div>
              <div className="bg-[#0c1320] px-2 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">Fee</p>
                <p className="mt-0.5 text-[12px] font-bold tabular-nums text-white">
                  {usd(match.feePusd)}
                </p>
              </div>
              <div className="bg-[#0c1320] px-2 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">Paid</p>
                <p className="mt-0.5 text-[12px] font-bold tabular-nums text-[#00fa7f]">
                  {usd(match.payoutPusd)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 px-4 py-3">
              {match.players.map((player) => (
                <div
                  key={player.userId}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#00fa7f]" />
                    <span className="truncate text-[11px] font-semibold text-white/80">
                      {player.displayName}
                      {player.isSelf ? ' (you)' : ''}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-white/65">
                    {player.cashedOut && player.cashoutMultiplierX100 != null
                      ? `cashed ${formatMultiplier(player.cashoutMultiplierX100)}`
                      : 'busted'}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
              {declined && !selfRequested ? (
                <p className="mb-2 text-center text-[10px] font-medium text-[#ffb4a6]">
                  Rematch declined.
                </p>
              ) : null}
              {selfRequested ? (
                <div className="mb-2 flex items-center justify-center gap-2 rounded-lg border border-[#ffdf1a]/20 bg-[#ffdf1a]/[0.06] px-2 py-2 text-[11px] text-[#ffdf1a]">
                  <span className="dual-live-dot h-1.5 w-1.5 rounded-full bg-[#ffdf1a]" />
                  Waiting for opponent
                </div>
              ) : opponentRequested ? (
                <div className="mb-2 flex items-center justify-center gap-2 rounded-lg border border-[#00fa7f]/20 bg-[#00fa7f]/[0.06] px-2 py-2 text-[11px] text-[#00fa7f]">
                  <span className="dual-live-dot h-1.5 w-1.5 rounded-full bg-[#00fa7f]" />
                  Rematch offer
                </div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onRematch}
                  disabled={busy != null || selfRequested}
                  className="h-10 flex-1 rounded-xl bg-[var(--t-green)] text-[12px] font-black uppercase tracking-[0.1em] text-[var(--t-green-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy === 'rematch'
                    ? 'Starting…'
                    : selfRequested
                      ? 'Waiting…'
                      : opponentRequested
                        ? 'Accept rematch'
                        : 'Rematch'}
                </button>
                {opponentRequested && !selfRequested ? (
                  <button
                    type="button"
                    onClick={onDecline}
                    disabled={busy != null}
                    className="h-10 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-[11px] font-semibold text-white/65 transition hover:border-white/20 disabled:opacity-50"
                  >
                    Decline
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onLeave}
                  disabled={busy != null}
                  className="h-10 flex-1 rounded-xl border border-white/[0.09] bg-white/[0.03] text-[12px] font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  New opponent
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={verify}
                  disabled={verifyLoading}
                  className="text-[10px] font-semibold text-[#7fd8ff] underline-offset-2 transition hover:underline disabled:opacity-50"
                >
                  {verifyLoading ? 'Verifying…' : 'Verify'}
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onDispute}
                    disabled={busy != null}
                    className="text-[10px] font-semibold text-white/35 transition hover:text-[#ff8a9a] disabled:opacity-50"
                  >
                    Report issue
                  </button>
                </div>
              </div>

              {verifyError ? (
                <p className="mt-1 text-[10px] text-[#ff8a9a]">{verifyError}</p>
              ) : null}

              {verification ? (
                <div className="mt-2 rounded-lg border border-white/[0.06] bg-[#070b13]/80 p-2.5 text-[10px] leading-relaxed text-white/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white/80">
                      {verification.hashMatches && verification.crashMatches
                        ? '✓ Verified'
                        : '✗ Mismatch'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVerification(null)}
                      className="text-white/40 hover:text-white"
                      aria-label="Close verification"
                    >
                      ✕
                    </button>
                  </div>
                  {verification.serverSeed ? (
                    <p className="mt-1 break-all font-mono text-[9px] text-white/45">
                      seed {verification.serverSeed}
                    </p>
                  ) : null}
                  <p className="mt-1 tabular-nums">
                    uniform {verification.uniform ?? '—'} · expected{' '}
                    {verification.expectedCrashMultiplierX100 ?? '—'} · stored{' '}
                    {verification.storedCrashMultiplierX100 ?? '—'}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
