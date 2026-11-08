import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { XpClaimCard } from '@/components/xp/xp-claim-card'
import { getSession } from '@/lib/auth/session'
import {
  DAILY_XP_BASE,
  DAILY_XP_BONUS_DAYS,
  DAILY_XP_STREAK_BONUS,
  XP_PER_LEVEL,
  getXpSummary,
  type XpSummary,
} from '@/lib/xp'
import { XpIcon } from '../_components/icons'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XP · toops',
  description: 'Claim daily XP, keep your streak alive, and level up your toops account.',
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatClaimDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-black/15 px-3 py-2.5 text-center">
      <p className="text-[11px] uppercase tracking-wide text-[var(--t-muted)]">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-white">
        {formatNumber(value)}
        {suffix && (
          <span className="ml-1 text-[11px] font-medium text-[var(--t-muted)]">{suffix}</span>
        )}
      </p>
    </div>
  )
}

function LevelCard({ summary }: { summary: XpSummary }) {
  const { level, intoLevel, needed, percent } = summary.levelProgress

  return (
    <section className="xp-surface relative overflow-hidden rounded-[20px] border border-[var(--t-border)] p-5 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd21a]">
            Your level
          </p>
          <div className="mt-1 flex items-end gap-2">
            <span className="xp-gold-text text-6xl font-black leading-none">{level}</span>
            <span className="mb-1.5 text-sm font-semibold text-[var(--t-muted)]">Level</span>
          </div>
          <p className="mt-2 text-sm text-[var(--t-muted)]">
            <span className="font-semibold text-white">{formatNumber(summary.xp)}</span> total XP
            earned
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:min-w-[300px]">
          <Stat label="Streak" value={summary.streak} suffix="days" />
          <Stat label="Best" value={summary.bestStreak} suffix="days" />
          <Stat label="Claims" value={summary.totalClaims} />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--t-muted)]">
          <span>
            {formatNumber(intoLevel)} / {formatNumber(XP_PER_LEVEL)} XP
          </span>
          <span>
            {formatNumber(needed)} XP to Level {level + 1}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={XP_PER_LEVEL}
          aria-valuenow={intoLevel}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/35"
        >
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#00fa7f,#ffd21a)]"
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6">
      <h2 className="text-lg font-semibold text-white">How XP works</h2>
      <ul className="mt-4 space-y-3 text-sm text-[var(--t-muted)]">
        <li className="flex gap-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ffd21a]/15 text-[10px] font-bold text-[#ffd21a]">
            1
          </span>
          Claim once per UTC day. The reset happens at midnight UTC.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ffd21a]/15 text-[10px] font-bold text-[#ffd21a]">
            2
          </span>
          Start at {DAILY_XP_BASE} XP. Each consecutive day adds +{DAILY_XP_STREAK_BONUS} XP, up to
          +{DAILY_XP_STREAK_BONUS * DAILY_XP_BONUS_DAYS} XP.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ffd21a]/15 text-[10px] font-bold text-[#ffd21a]">
            3
          </span>
          Miss a day and the streak resets to day one. Every {XP_PER_LEVEL} XP is a new level.
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ffd21a]/15 text-[10px] font-bold text-[#ffd21a]">
            4
          </span>
          XP is stored on your toops account and is separate from your BCH balance.
        </li>
      </ul>
    </section>
  )
}

function Activity({ summary }: { summary: XpSummary }) {
  return (
    <section className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Recent activity</h2>
        <span className="text-xs text-[var(--t-muted)]">
          {formatNumber(summary.totalClaimed)} XP claimed all-time
        </span>
      </div>

      {summary.claims.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--t-border)] px-4 py-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffd21a]/10 text-[#ffd21a]">
            <XpIcon className="h-5 w-5" />
          </span>
          <p className="text-sm text-[var(--t-muted)]">
            No claims yet. Your first check-in is waiting.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {summary.claims.map((claim) => (
            <li
              key={claim.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ffd21a]/10 text-[#ffd21a]">
                  <XpIcon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">Daily check-in</p>
                  <p className="truncate text-xs text-[var(--t-muted)]">
                    {formatClaimDate(claim.createdAt)} · day {claim.streak} streak
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[var(--t-green)]">
                +{formatNumber(claim.amount)} XP
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SignedOut() {
  return (
    <div className="mt-6 rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#ffd21a]/10 text-[#ffd21a]">
        <XpIcon className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-white">Sign in to start earning XP</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--t-muted)]">
        Claim daily XP, build a streak, and level up. XP lives on your toops account and does not
        touch your BCH balance.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <AuthTrigger
          view="telegram"
          className="cursor-pointer rounded-lg bg-[var(--t-green)] px-4 py-2.5 text-sm font-semibold text-[var(--t-green-ink)] shadow-[0_0_24px_rgba(0,250,127,0.24)] transition hover:brightness-110 active:scale-[0.98]"
        >
          Continue with Telegram
        </AuthTrigger>
        <AuthTrigger
          view="wallet"
          className="cursor-pointer rounded-lg border border-[var(--t-border)] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[var(--t-green)]"
        >
          Connect wallet
        </AuthTrigger>
      </div>
    </div>
  )
}

export default async function XpPage() {
  const session = await getSession()
  const summary = session ? await getXpSummary(session.user.id) : null

  return (
    <main className="mx-auto w-full max-w-[1100px] px-3 pb-24 pt-6 lg:px-4 lg:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffd21a]">Rewards</p>
          <h1 className="mt-1 flex items-center gap-2.5 text-3xl font-bold tracking-tight text-white">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ffd21a]/10 text-[#ffd21a]">
              <XpIcon className="h-6 w-6" />
            </span>
            Experience
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--t-muted)]">
            Show up every day, claim XP, and climb the levels. Your progress is saved to your
            account.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-[var(--t-border)] px-3 py-2 text-sm text-[var(--t-muted)] transition hover:border-[var(--t-green)] hover:text-white"
        >
          ← Back to games
        </Link>
      </div>

      {!session || !summary ? (
        <SignedOut />
      ) : (
        <>
          <div className="mt-6">
            <LevelCard summary={summary} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
            <XpClaimCard
              canClaim={summary.canClaim}
              claimAmount={summary.claimAmount}
              streak={summary.streak}
              nextClaimAt={summary.nextClaimAt?.toISOString() ?? null}
            />
            <HowItWorks />
          </div>

          <div className="mt-3">
            <Activity summary={summary} />
          </div>
        </>
      )}
    </main>
  )
}
