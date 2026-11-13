'use client'

import { useState } from 'react'
import type { DualMatchView, DualVerifyResponse } from '@/lib/dual/types'
import { shortHash } from './format'

type FairnessPanelProps = {
  clientSeed: string
  match: DualMatchView | null
  busy: boolean
  onRegenerate: () => void
}

export function FairnessPanel({ clientSeed, match, busy, onRegenerate }: FairnessPanelProps) {
  const [verification, setVerification] = useState<DualVerifyResponse | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function verify() {
    if (!match) return
    setVerifying(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/dual/verify?matchId=${encodeURIComponent(match.id)}&round=${match.round}`,
        { cache: 'no-store' },
      )
      const data = (await response.json().catch(() => null)) as
        DualVerifyResponse | { error?: string } | null
      if (!response.ok) {
        setError((data as { error?: string } | null)?.error ?? 'Verification failed.')
        return
      }
      setVerification(data as DualVerifyResponse)
    } catch {
      setError('Verification failed. Try again.')
    } finally {
      setVerifying(false)
    }
  }

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(clientSeed)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <details className="dual-card group/section bg-[#050910] p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-md">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <path
                d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3Z"
                strokeLinejoin="round"
              />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-lg font-bold text-white">Provably fair</h2>
        </div>
        <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
          ＋
        </span>
      </summary>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-[#070b13]/60 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--t-muted)]">
            Your client seed
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.05] bg-black/25 px-2 py-1.5 font-mono text-[11px] text-white/75">
              {clientSeed || '—'}
            </code>
            <button
              type="button"
              onClick={copySeed}
              className="h-8 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[10px] font-semibold text-white/65 transition hover:border-white/20"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy || Boolean(match)}
              title={match ? 'Client seed is locked during a match' : 'Generate a new client seed'}
              className="h-8 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[10px] font-semibold text-white/65 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              New
            </button>
          </div>
        
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#070b13]/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--t-muted)]">
              Current round
            </p>
            {match ? (
              <button
                type="button"
                onClick={verify}
                disabled={verifying || !match.serverSeed}
                className="text-[10px] font-semibold text-[#7fd8ff] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verifying ? 'Verifying…' : match.serverSeed ? 'Verify' : 'Reveals at end'}
              </button>
            ) : null}
          </div>

          {match ? (
            <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--t-muted)]">Round</span>
                <span className="font-semibold tabular-nums text-white/80">
                  #{match.round}
                  {match.replayCount > 0 ? ` · ${match.replayCount} replay` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--t-muted)]">Server seed hash</span>
                <span className="font-mono text-white/70">
                  {shortHash(match.serverSeedHash, 10, 6)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--t-muted)]">Nonce</span>
                <span className="font-mono text-white/70">{match.nonce ?? 'hidden'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--t-muted)]">Crash point</span>
                <span className="font-mono text-white/70">
                  {match.crashMultiplierX100 != null
                    ? `${(match.crashMultiplierX100 / 100).toFixed(2)}x`
                    : 'hidden'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0 text-[var(--t-muted)]">Server seed</span>
                <span className="break-all text-right font-mono text-white/55">
                  {match.serverSeed ?? 'revealed after launch'}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--t-muted)]">Seeds reveal after launch.</p>
          )}

          {error ? <p className="mt-1.5 text-[10px] text-[#ff8a9a]">{error}</p> : null}

          {verification ? (
            <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/25 p-2 text-[10px] leading-relaxed text-white/60">
              <p
                className={`font-semibold ${
                  verification.hashMatches && verification.crashMatches
                    ? 'text-[#00fa7f]'
                    : 'text-[#ff8a9a]'
                }`}
              >
                {verification.hashMatches && verification.crashMatches
                  ? '✓ Hash and crash point match'
                  : '✗ Integrity mismatch'}
              </p>
              <p className="mt-1 break-all font-mono text-[9px] text-white/40">
                {verification.hmacHex}
              </p>
              <p className="mt-1 tabular-nums">
                uniform {verification.uniform} · expected {verification.expectedCrashMultiplierX100}{' '}
                · stored {verification.storedCrashMultiplierX100}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  )
}
