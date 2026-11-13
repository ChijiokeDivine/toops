'use client'

import { AuthTrigger } from '@/components/auth/auth-trigger'
import { DUAL_MAX_STAKE_PUSD, DUAL_MIN_STAKE_PUSD } from '@/lib/dual/config'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'
import { usd } from './format'
import { CrashDemo } from './crash-demo'

type StakePanelProps = {
  balancePusd: string
  stake: string
  onStakeChange: (value: string) => void
  onJoin: () => void
  busy: boolean
  error: string | null
  signedIn?: boolean
  players?: number
}



function withSeparators(value: string): string {
  const [whole = '0', fraction] = value.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

function CoinBadge({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2ad004] text-[13px] font-black leading-none text-[#04230a] ${className}`}
    >
      $
    </span>
  )
}

export function StakePanel({
  balancePusd,
  stake,
  onStakeChange,
  onJoin,
  busy,
  error,
  signedIn = true,
  players = 1,
}: StakePanelProps) {
  const stakePusd = parsePusdInput(stake) ?? 0n
  const balance = parsePusdInput(balancePusd) ?? 0n
  // Winner takes the doubled pot minus the 1% platform fee; profit is the payout
  // minus the stake that was locked.
  const profitPusd = stakePusd > 0n ? stakePusd - (stakePusd * 2n) / 100n : 0n




  let validation: string | null = null
  if (signedIn) {
    if (!stakePusd) {
      validation = 'Enter a valid stake.'
    } else if (stakePusd < DUAL_MIN_STAKE_PUSD) {
      validation = `Minimum stake is ${usd(formatPusdUnits(DUAL_MIN_STAKE_PUSD))}.`
    } else if (stakePusd > DUAL_MAX_STAKE_PUSD) {
      validation = `Maximum stake is ${usd(formatPusdUnits(DUAL_MAX_STAKE_PUSD))}.`
    } else if (stakePusd > balance) {
      validation = `You need ${usd(formatPusdUnits(stakePusd - balance))} more PUSD.`
    }
  }

  const setStake = (next: bigint) => {
    onStakeChange(formatPusdUnits(next))
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.04] bg-[#0c1116]">
      <div className="grid lg:grid-cols-[330px_minmax(0,1fr)]">
        {/* ── Controls ─────────────────────────────────────────── */}
        <div className="flex flex-col border-b border-[#1b2127] bg-[#0f151b] p-4 lg:min-h-[640px] lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[13px] font-medium text-[#8b97a5]">Stake</p>
            <div className="mt-2 flex h-11 items-stretch overflow-hidden rounded-xl bg-[#19212a]">
              <div className="flex min-w-0 flex-1 items-center gap-2 pl-2.5">
                <CoinBadge />
                <input
                  inputMode="decimal"
                  value={stake}
                  placeholder="0.00"
                  aria-label="Your bet in PUSD"
                  onChange={(event) => {
                    onStakeChange(event.target.value.replace(/[^0-9.]/g, ''))
                  }}
                  className="h-full w-full min-w-0 bg-transparent text-[16px] font-semibold tabular-nums text-white outline-none placeholder:text-white/30"
                />
              </div>
              <div className="flex items-stretch bg-[#1b232c]">
                <button
                  type="button"
                  onClick={() => setStake(stakePusd > 2n ? stakePusd / 2n : 1n)}
                  className="w-11 border-l border-[#2b333d] text-[13px] font-semibold text-[#a8b0bb] transition hover:text-white"
                >
                  ½
                </button>
                <button
                  type="button"
                  onClick={() => setStake(stakePusd > 0n ? stakePusd * 2n : 0n)}
                  className="w-11 border-l border-[#2b333d] text-[13px] font-semibold text-[#a8b0bb] transition hover:text-white"
                >
                  2x
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const capped = balance > DUAL_MAX_STAKE_PUSD ? DUAL_MAX_STAKE_PUSD : balance
                    onStakeChange(capped > 0n ? formatPusdUnits(capped) : '')
                  }}
                  className="w-12 border-l border-[#2b333d] text-[13px] font-semibold text-[#a8b0bb] transition hover:text-white"
                >
                  Max
                </button>
              </div>
            </div>
          </div>

        

          <div className="mt-4">
            <p className="text-[13px] font-medium text-[#8b97a5]">Profit</p>
            <div className="mt-2 flex h-11 items-center gap-2 rounded-xl border-2 border-[#252f3a] px-2.5">
              <CoinBadge />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tabular-nums text-white/65">
                {withSeparators(formatPusdUnits(profitPusd))}
              </span>
              
            </div>
          </div>

          {signedIn ? (
            <button
              type="button"
              onClick={onJoin}
              disabled={busy || validation != null}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#00ff86] text-[16px] font-bold text-[#03170d] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(0,255,134,0.16)] transition hover:brightness-105 active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? 'Starting…' : 'Play'}
            </button>
          ) : (
            <AuthTrigger
              view="telegram"
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#00ff86] text-[16px] font-bold text-[#03170d] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(0,255,134,0.16)] transition hover:brightness-105 active:scale-[0.995]"
            >
              Sign in
            </AuthTrigger>
          )}

          {validation ? (
            <p className="mt-2 text-center text-[11px] font-medium text-[#ffb4a6]">{validation}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-center text-[11px] font-medium text-[#ff8a9a]">{error}</p>
          ) : null}

          <div className="mt-auto pt-8">
            <div className="flex h-12 items-center gap-2.5 rounded-xl bg-[#141b22] px-3">
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] shrink-0 text-[#8e97a3]"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="3.4" />
                <path d="M2.8 18.4c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2c0 .6-.5 1.1-1.1 1.1H3.9c-.6 0-1.1-.5-1.1-1.1Z" />
                <circle cx="17.2" cy="9.2" r="2.6" opacity="0.75" />
                <path
                  d="M16.4 13.1c2.8.2 4.8 1.9 4.8 4.4 0 .6-.5 1.1-1.1 1.1h-3.2c.2-.5.3-1 .3-1.6 0-1.5-.6-2.8-1.6-3.8.3-.1.6-.1.8-.1Z"
                  opacity="0.75"
                />
              </svg>
              <span className="text-[16px] font-bold tabular-nums text-white">
                {Math.max(1, players)}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <CoinBadge className="h-5 w-5 text-[11px]" />
                <span className="text-[16px] font-bold tabular-nums text-white">
                  {withSeparators(balancePusd)}
                </span>
              </div>

              <span className="ml-3 h-5 w-px bg-white/10" />
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-[#8e97a3]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="m12 7 6.5 6.5-1.8 1.8L12 10.6l-4.7 4.7-1.8-1.8L12 7Z" />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Demo board (non-interactive) ──────────────────────── */}
        <CrashDemo />
      </div>
    </section>
  )
}
