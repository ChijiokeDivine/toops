'use client'

import {
  DUAL_DEFAULT_STAKE_PUSD,
  DUAL_MAX_STAKE_PUSD,
  DUAL_MIN_STAKE_PUSD,
  DUAL_STAKE_PRESETS,
} from '@/lib/dual/config'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'
import { usd } from './format'

type StakePanelProps = {
  balancePusd: string
  stake: string
  onStakeChange: (value: string) => void
  customMode: boolean
  onCustomModeChange: (value: boolean) => void
  onJoin: () => void
  busy: boolean
  error: string | null
}

function projected(stakePusd: bigint | null) {
  if (!stakePusd) return null
  const pot = stakePusd * 2n
  const fee = pot / 100n
  return { pot, fee, payout: pot - fee }
}

export function StakePanel({
  balancePusd,
  stake,
  onStakeChange,
  customMode,
  onCustomModeChange,
  onJoin,
  busy,
  error,
}: StakePanelProps) {
  const stakePusd = parsePusdInput(stake)
  const balance = parsePusdInput(balancePusd) ?? 0n
  const amounts = projected(stakePusd)

  let validation: string | null = null
  if (!stakePusd) {
    validation = 'Enter a valid stake.'
  } else if (stakePusd < DUAL_MIN_STAKE_PUSD) {
    validation = `Minimum stake is ${usd(formatPusdUnits(DUAL_MIN_STAKE_PUSD))}.`
  } else if (stakePusd > DUAL_MAX_STAKE_PUSD) {
    validation = `Maximum stake is ${usd(formatPusdUnits(DUAL_MAX_STAKE_PUSD))}.`
  } else if (stakePusd > balance) {
    validation = `You need ${usd(formatPusdUnits(stakePusd - balance))} more PUSD.`
  }

  return (
    <section className="dual-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Choose your stake</h2>
          <p className="mt-0.5 text-[12px] text-[var(--t-muted)]">
            You&apos;ll be paired with a random player at the exact same stake.
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--t-muted)]">
            Balance
          </p>
          <p className="text-sm font-bold tabular-nums text-white">{usd(balancePusd)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {DUAL_STAKE_PRESETS.map((preset) => {
          const formatted = formatPusdUnits(preset.amountPusd)
          const selected = !customMode && stake === formatted
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onCustomModeChange(false)
                onStakeChange(formatted)
              }}
              className={`dual-chip h-11 rounded-xl border text-sm font-bold transition ${
                selected
                  ? 'border-[#00fa7f]/60 bg-[#00fa7f]/15 text-[#00fa7f] shadow-[0_0_20px_rgba(0,250,127,0.12)]'
                  : 'border-white/[0.07] bg-white/[0.03] text-white/75 hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              ${preset.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            onCustomModeChange(true)
            onStakeChange('')
          }}
          className={`dual-chip h-11 rounded-xl border text-sm font-bold transition ${
            customMode
              ? 'border-[#00fa7f]/60 bg-[#00fa7f]/15 text-[#00fa7f]'
              : 'border-white/[0.07] bg-white/[0.03] text-white/75 hover:border-white/20 hover:bg-white/[0.06]'
          }`}
        >
          Custom
        </button>
      </div>

      {customMode ? (
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#080d17]/70 px-3 focus-within:border-[#00fa7f]/40">
          <span className="text-sm font-semibold text-[var(--t-muted)]">$</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder={formatPusdUnits(DUAL_DEFAULT_STAKE_PUSD)}
            value={stake}
            onChange={(event) => {
              const value = event.target.value.replace(/[^0-9.]/g, '')
              onStakeChange(value)
            }}
            className="h-11 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
            aria-label="Custom stake in PUSD"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--t-muted)]">
            PUSD
          </span>
        </label>
      ) : null}

      <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.06] bg-[#070b13]/55 p-3 text-[12px] sm:grid-cols-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">Your stake</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {amounts ? usd(formatPusdUnits(stakePusd!)) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">Prize pool</p>
          <p className="mt-0.5 font-bold tabular-nums text-white">
            {amounts ? usd(formatPusdUnits(amounts.pot)) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
            Winner gets
          </p>
          <p className="mt-0.5 font-bold tabular-nums text-[#00fa7f]">
            {amounts ? usd(formatPusdUnits(amounts.payout)) : '—'}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || validation != null}
        onClick={onJoin}
        className="dual-cta mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--t-green)] text-sm font-black uppercase tracking-[0.12em] text-[var(--t-green-ink)] shadow-[0_0_30px_rgba(0,250,127,0.22)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
      >
        {busy ? (
          <span className="dual-spinner h-4 w-4 rounded-full border-2 border-[#03170d]/30 border-t-[#03170d]" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        )}
        {busy ? 'Locking stake…' : 'Find opponent'}
      </button>

      <p className="mt-2 text-center text-[11px] text-[var(--t-muted)]">
        Your stake is locked while searching and refunded automatically if no opponent is found.
      </p>
      {validation ? (
        <p className="mt-1 text-center text-[11px] font-medium text-[#ffb4a6]">{validation}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-center text-[11px] font-medium text-[#ff8a9a]">{error}</p>
      ) : null}
    </section>
  )
}
