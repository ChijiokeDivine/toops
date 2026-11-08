'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { XpIcon } from '@/app/_components/icons'

type XpClaimCardProps = {
  canClaim: boolean
  claimAmount: number
  streak: number
  nextClaimAt: string | null
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
}

const subscribeToMount = () => () => {}

export function XpClaimCard({ canClaim, claimAmount, streak, nextClaimAt }: XpClaimCardProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  )

  useEffect(() => {
    if (!nextClaimAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [nextClaimAt])

  async function handleClaim() {
    setPending(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/xp/claim', { method: 'POST' })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to claim XP right now.')
      }

      setMessage(`+${claimAmount.toLocaleString()} XP claimed. See you tomorrow!`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to claim XP right now.')
    } finally {
      setPending(false)
    }
  }

  const remaining = nextClaimAt ? new Date(nextClaimAt).getTime() - now : 0

  return (
    <div className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--t-muted)]">
            Daily check-in
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Claim your XP</h2>
          <p className="mt-1 text-sm text-[var(--t-muted)]">
            One claim per day (UTC). Keep the streak alive for a bigger reward.
          </p>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#ffd21a]/10 text-[#ffd21a]">
          <XpIcon className="h-6 w-6" />
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 px-4 py-3.5">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">
            Today&apos;s reward
          </p>
          <p className="mt-0.5 text-2xl font-bold text-white">
            +{claimAmount.toLocaleString()} <span className="text-sm text-[#ffd21a]">XP</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Streak</p>
          <p className="mt-0.5 text-2xl font-bold text-white">
            {streak}{' '}
            <span className="text-sm text-[var(--t-muted)]">day{streak === 1 ? '' : 's'}</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        {canClaim ? (
          <button
            type="button"
            onClick={() => void handleClaim()}
            disabled={pending}
            className="w-full cursor-pointer rounded-xl bg-[linear-gradient(180deg,#ffe98a_0%,#ffd21a_55%,#f0ad00_100%)] px-5 py-3 text-base font-bold text-[#1a1200] shadow-[0_8px_30px_rgba(255,210,26,0.25)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Claiming…' : `Claim +${claimAmount.toLocaleString()} XP`}
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--t-green)]/25 bg-[var(--t-green)]/10 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--t-green)]">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="m8 12.3 2.6 2.6L16.4 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Claimed today
            </span>
            <span className="text-xs text-[var(--t-muted)]">
              Next claim in{' '}
              <span className="font-mono text-white">
                {mounted && nextClaimAt ? formatCountdown(remaining) : '--:--:--'}
              </span>
            </span>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-[var(--t-green)]">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      <p className="mt-4 text-xs text-[var(--t-muted)]">
        Streak bonus: +25 XP for each consecutive day, up to +150 XP on day 7 and beyond.
      </p>
    </div>
  )
}
