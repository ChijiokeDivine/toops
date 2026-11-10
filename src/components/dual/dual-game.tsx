'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DUAL_DEFAULT_STAKE_PUSD, DUAL_HEARTBEAT_MS, DUAL_POLL_IDLE_MS, DUAL_POLL_RUNNING_MS } from '@/lib/dual/config'
import { formatMultiplier } from '@/lib/dual/curve'
import type { DualStateResponse, DualStatus } from '@/lib/dual/types'
import { formatPusdUnits } from '@/lib/pusd'
import { CrashStage } from './crash-stage'
import { FairnessPanel } from './fairness-panel'
import { HistoryPanel } from './history-panel'
import { PlayerCard } from './player-card'
import { QueuePanel } from './queue-panel'
import { ResultOverlay } from './result-overlay'
import { StakePanel } from './stake-panel'
import { useDualAudio } from './use-dual-audio'
import { usd } from './format'

type Notice = { tone: 'info' | 'error' | 'success'; text: string } | null

function statusSummary(status: DualStatus): string {
  if (status === 'WAITING') return 'Waiting for both players'
  if (status === 'COUNTDOWN') return 'Launching'
  if (status === 'RUNNING') return 'Rocket in flight'
  if (status === 'INTERMISSION') return 'Both busted'
  if (status === 'SETTLED') return 'Round settled'
  if (status === 'CANCELLED') return 'Cancelled & refunded'
  return 'Preparing'
}

function secondsUntil(iso: string | null, serverNow: string | null): number {
  if (!iso) return 0
  const offset = serverNow ? new Date(serverNow).getTime() - Date.now() : 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - (Date.now() + offset)) / 1_000))
}

export function DualGame() {
  const [state, setState] = useState<DualStateResponse | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [stake, setStake] = useState(() => formatPusdUnits(DUAL_DEFAULT_STAKE_PUSD))

  const authRef = useRef(false)
  const readyKeyRef = useRef<string | null>(null)
  const previousRef = useRef<{ matchId?: string; status?: DualStatus; round?: number }>({})
  const tickRef = useRef<number | null>(null)
  const { play, muted, toggleMuted } = useDualAudio()

  const refresh = useCallback(async (): Promise<DualStateResponse | null> => {
    try {
      const response = await fetch('/api/dual/state', { cache: 'no-store' })
      if (response.status === 401) {
        authRef.current = true
        setAuthRequired(true)
        setState(null)
        setLoading(false)
        return null
      }
      const data = (await response.json().catch(() => null)) as
        DualStateResponse | { error?: string } | null
      if (!response.ok || !data || 'error' in data) {
        setNotice({
          tone: 'error',
          text: (data as { error?: string } | null)?.error ?? 'Unable to load the game.',
        })
        // Never leave the skeleton spinning forever: a failed poll is shown as
        // an error with a retry button instead.
        setLoading(false)
        return null
      }
      const stateData = data as DualStateResponse
      authRef.current = false
      setAuthRequired(false)
      setState(stateData)
      setLoading(false)
      return stateData
    } catch {
      setNotice({ tone: 'error', text: 'Unable to reach the game server.' })
      setLoading(false)
      return null
    }
  }, [])

  useEffect(() => {
    const control: { cancelled: boolean } = { cancelled: false }
    const schedule: { timer?: number } = {}

    const run = async () => {
      const data = await refresh()
      if (control.cancelled) return

      if (data?.match?.status === 'WAITING') {
        const key = `${data.match.id}:${data.match.round}`
        if (readyKeyRef.current !== key) {
          readyKeyRef.current = key
          try {
            const response = await fetch('/api/dual/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ matchId: data.match.id }),
            })
            if (!response.ok && !control.cancelled) readyKeyRef.current = null
          } catch {
            if (!control.cancelled) readyKeyRef.current = null
          }
        }
      }

      const active = data?.match?.status === 'RUNNING' || data?.match?.status === 'COUNTDOWN'
      const delay = authRef.current ? 2_500 : active ? DUAL_POLL_RUNNING_MS : DUAL_POLL_IDLE_MS
      schedule.timer = window.setTimeout(run, delay)
    }

    void run()
    return () => {
      control.cancelled = true
      if (schedule.timer) window.clearTimeout(schedule.timer)
    }
  }, [refresh])

  // Presence ping that is independent of the state poll. A state poll loads the
  // user, the match and the ledger, so on a slow link it can take longer than
  // the disconnect grace window; this single-update request keeps the player
  // marked online while the heavier request is still in flight.
  useEffect(() => {
    const activeMatch = state?.match ?? null
    const matchId = activeMatch?.id
    const status = activeMatch?.status
    if (
      !matchId ||
      !status ||
      (status !== 'WAITING' &&
        status !== 'COUNTDOWN' &&
        status !== 'RUNNING' &&
        status !== 'INTERMISSION')
    ) {
      return
    }

    const control = { cancelled: false }
    const schedule: { timer?: number } = {}

    const beat = async () => {
      try {
        await fetch('/api/dual/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId }),
          cache: 'no-store',
          keepalive: true,
        })
      } catch {
        // The next tick retries; a failed ping must never break the UI.
      }
      if (!control.cancelled) schedule.timer = window.setTimeout(beat, DUAL_HEARTBEAT_MS)
    }

    schedule.timer = window.setTimeout(beat, DUAL_HEARTBEAT_MS)
    return () => {
      control.cancelled = true
      if (schedule.timer) window.clearTimeout(schedule.timer)
    }
    // Restart only when the match itself changes. Using the whole `state.match`
    // object would restart the timer on every poll, so the ping would never run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.match?.id, state?.match?.status])

  // Background tabs get their timers throttled; refresh immediately when the
  // player comes back so the countdown does not look frozen.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [refresh])

  const mutate = useCallback(
    async (
      path: string,
      method: 'POST' | 'DELETE',
      body: unknown,
      label: string,
    ): Promise<Record<string, unknown> | null> => {
      setBusy(label)
      setNotice(null)
      try {
        const response = await fetch(path, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const data = (await response.json().catch(() => null)) as
          Record<string, unknown> | { error?: string } | null
        if (!response.ok) {
          setNotice({
            tone: 'error',
            text: (data as { error?: string } | null)?.error ?? 'Something went wrong.',
          })
          return null
        }
        return data
      } catch {
        setNotice({ tone: 'error', text: 'Network error. Please try again.' })
        return null
      } finally {
        setBusy(null)
        void refresh()
      }
    },
    [refresh],
  )

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.tone === 'error' ? 6_500 : 4_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const match = state?.match ?? null
  const selfId = state?.user.id ?? ''
  const selfPlayer = match?.players.find((player) => player.isSelf) ?? null
  const opponent = match?.players.find((player) => !player.isSelf) ?? null
  const outcome: 'win' | 'lose' | 'neutral' =
    match?.status === 'SETTLED' ? (match.winnerUserId === selfId ? 'win' : 'lose') : 'neutral'

  // Sound cues. Refs guard against duplicate plays on every poll.
  useEffect(() => {
    if (!match) {
      previousRef.current = {}
      return
    }
    const previous = previousRef.current
    if (previous.matchId === match.id) {
      if (previous.status === 'COUNTDOWN' && match.status === 'RUNNING') play('launch')
      if (previous.status !== 'SETTLED' && match.status === 'SETTLED') {
        play('crash')
        const won = match.winnerUserId === selfId
        window.setTimeout(() => play(won ? 'win' : 'lose'), 260)
      }
      if (previous.status !== 'INTERMISSION' && match.status === 'INTERMISSION') play('crash')
      if (previous.status !== 'CANCELLED' && match.status === 'CANCELLED') play('lose')
    }
    previousRef.current = { matchId: match.id, status: match.status, round: match.round }
  }, [match, play, selfId])

  useEffect(() => {
    if (!match || match.status !== 'COUNTDOWN') {
      tickRef.current = null
      return
    }
    const second = Math.max(1, Math.ceil((match.countdownMsRemaining ?? 0) / 1_000))
    if (tickRef.current !== second) {
      tickRef.current = second
      play('tick')
    }
  }, [match, play])

  const join = useCallback(async () => {
    const result = await mutate('/api/dual/queue', 'POST', { stake }, 'queue')
    if (result) play('queue')
  }, [mutate, play, stake])

  const cancelQueue = useCallback(async () => {
    await mutate('/api/dual/queue', 'DELETE', null, 'cancel-queue')
  }, [mutate])

  const cashout = useCallback(async () => {
    if (!match) return
    const result = await mutate('/api/dual/cashout', 'POST', { matchId: match.id }, 'cashout')
    if (result) {
      play('cashout')
      const multiplier = Number(result.multiplierX100 ?? 0)
      setNotice({
        tone: 'success',
        text: `Cashed out at ${formatMultiplier(multiplier)}. The last cashout takes the pot.`,
      })
    }
  }, [match, mutate, play])

  useEffect(() => {
    if (!match?.viewer.canCashOut) return
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      void cashout()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cashout, match?.viewer.canCashOut])

  const cancelMatch = useCallback(async () => {
    if (!match) return
    await mutate('/api/dual/cancel', 'POST', { matchId: match.id }, 'cancel-match')
  }, [match, mutate])

  const leave = useCallback(async () => {
    if (!match) return
    const result = await mutate('/api/dual/leave', 'POST', { matchId: match.id }, 'leave')
    if (result) setNotice({ tone: 'info', text: 'Match closed. Choose a stake to play again.' })
  }, [match, mutate])

  const rematch = useCallback(async () => {
    if (!match) return
    const result = await mutate(
      '/api/dual/rematch',
      'POST',
      { matchId: match.id, action: 'request' },
      'rematch',
    )
    if (result) {
      if (result.matchId)
        setNotice({ tone: 'success', text: 'Rematch locked — new round starting.' })
      else play('click')
    }
  }, [match, mutate, play])

  const declineRematch = useCallback(async () => {
    if (!match) return
    await mutate('/api/dual/rematch', 'POST', { matchId: match.id, action: 'decline' }, 'decline')
  }, [match, mutate])

  const regenerateSeed = useCallback(async () => {
    const result = await mutate('/api/dual/client-seed', 'POST', null, 'seed')
    if (result) setNotice({ tone: 'success', text: 'New client seed generated.' })
  }, [mutate])

  const dispute = useCallback(async () => {
    if (!match) return
    const reason = window.prompt('Describe the problem with this round:')
    if (!reason || reason.trim().length < 3) return
    const result = await mutate(
      '/api/dual/dispute',
      'POST',
      { matchId: match.id, reason },
      'dispute',
    )
    if (result) {
      setNotice({
        tone: 'info',
        text: result.cancelled
          ? 'Dispute raised before launch — the match was cancelled and refunded.'
          : 'Dispute recorded. The round result is preserved for review.',
      })
    }
  }, [match, mutate])

  const historyKey = match ? `${match.id}:${match.status}:${match.round}` : 'idle'
  const showLobby = !match && !state?.queue

  const rightPanel = match ? (
    <div className="dual-card flex flex-col justify-between p-3">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--t-muted)]">
          Prize pool
        </p>
        <p className="mt-1 text-2xl font-black tabular-nums text-white">{usd(match.potPusd)}</p>
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--t-muted)]">Winner gets</span>
            <span className="font-bold tabular-nums text-[#00fa7f]">{usd(match.payoutPusd)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--t-muted)]">1% fee</span>
            <span className="tabular-nums text-white/75">{usd(match.feePusd)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--t-muted)]">Round</span>
            <span className="tabular-nums text-white/75">
              #{match.round}
              {match.replayCount > 0 ? ` · R${match.replayCount}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--t-muted)]">Status</span>
            <span className="text-right text-white/75">{statusSummary(match.status)}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[#ffdf1a]/15 bg-[#ffdf1a]/[0.05] p-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#ffdf1a]/80">
          Winning rule
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-white/60">
          The last cashout before the crash takes the pot. Cashouts stay hidden until the round
          ends.
        </p>
      </div>
    </div>
  ) : null

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {match?.status === 'RUNNING' ? (
              <span className="flex items-center gap-1.5 rounded-full border border-[#00fa7f]/30 bg-[#00fa7f]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#00fa7f]">
                <span className="dual-live-dot h-1.5 w-1.5 rounded-full bg-[#00fa7f]" />
                Live
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
        
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/65 transition hover:border-white/20 hover:text-white"
          >
            {muted ? (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeLinejoin="round" />
                <path d="m17 9 4 6M21 9l-4 6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeLinejoin="round" />
                <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-[12px] font-medium ${
            notice.tone === 'error'
              ? 'border-[#ff5b6e]/25 bg-[#ff5b6e]/10 text-[#ffb4c0]'
              : notice.tone === 'success'
                ? 'border-[#00fa7f]/25 bg-[#00fa7f]/10 text-[#8dffc4]'
                : 'border-white/[0.08] bg-white/[0.04] text-white/70'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <div className="dual-card h-[320px] animate-pulse bg-white/[0.02]" />
      ) : !state && !authRequired ? (
        <div className="dual-card flex h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-bold text-white">Could not load the game</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-[var(--t-muted)]">
            The server took too long to answer. Your match is still running on the server — retry
            to reconnect.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              void refresh()
            }}
            className="h-9 rounded-lg bg-[var(--t-green)] px-4 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--t-green-ink)] transition hover:brightness-110"
          >
            Retry
          </button>
        </div>
      ) : state?.queue ? (
        <QueuePanel
          stakePusd={state.queue.stakePusd}
          expiresAt={state.queue.expiresAt}
          onCancel={cancelQueue}
          busy={busy === 'cancel-queue'}
        />
      ) : showLobby ? (
        <StakePanel
          balancePusd={state?.user.balancePusd ?? '0.00'}
          stake={stake}
          onStakeChange={setStake}
          onJoin={join}
          busy={busy === 'queue'}
          error={null}
          signedIn={!authRequired && state != null}
          players={state?.match?.players.length ?? 1}
        />
      ) : match ? (
        <section className="dual-card p-3 sm:p-4 ">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-semibold text-white/65">
                Round #{match.round}
              </span>
              <span className="text-[var(--t-muted)]">{usd(match.stakePusd)} each</span>
              {match.replayCount > 0 ? (
                <span className="rounded-md border border-[#ffdf1a]/20 bg-[#ffdf1a]/10 px-2 py-0.5 text-[10px] font-semibold text-[#ffdf1a]">
                  Replay {match.replayCount}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] font-semibold text-white/55">
              Pot {usd(match.potPusd)} · winner {usd(match.payoutPusd)}
            </p>
          </div>

          <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[200px_minmax(0,1fr)_200px]">
            <div className="order-2 grid grid-cols-2 gap-2.5 lg:order-1 lg:grid-cols-1">
              {match.players.map((player) => (
                <PlayerCard
                  key={player.userId}
                  player={player}
                  status={match.status}
                  winnerUserId={match.winnerUserId}
                />
              ))}
            </div>

            <div className="order-1 min-w-0 lg:order-2">
              <div className="relative">
                <CrashStage
                  status={match.status}
                  startsAt={match.startsAt}
                  crashMultiplierX100={match.crashMultiplierX100}
                  currentMultiplierX100={match.currentMultiplierX100}
                  countdownMsRemaining={match.countdownMsRemaining}
                  serverNow={match.serverNow}
                  round={match.round}
                  outcome={outcome}
                />

                {match.status === 'WAITING' ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#050914]/78 p-4 text-center backdrop-blur-sm">
                    <span className="dual-spinner h-7 w-7 rounded-full border-2 border-[#00fa7f]/25 border-t-[#00fa7f]" />
                    <p className="mt-3 text-sm font-bold text-white">Waiting for both players</p>
                    <p className="mt-1 max-w-xs text-[11px] text-[var(--t-muted)]">
                      The round starts when both players are loaded. Stakes are already locked.
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[10px]">
                      {match.players.map((player) => (
                        <span
                          key={player.userId}
                          className="flex items-center gap-1.5 text-white/60"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${player.ready ? 'bg-[#00fa7f]' : 'bg-white/25'}`}
                          />
                          {player.isSelf ? 'You' : 'Opponent'} {player.ready ? 'ready' : 'loading'}
                        </span>
                      ))}
                    </div>
                    {match.viewer.canCancel ? (
                      <button
                        type="button"
                        onClick={cancelMatch}
                        disabled={busy === 'cancel-match'}
                        className="mt-3 h-8 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[10px] font-semibold text-white/65 transition hover:border-white/25 disabled:opacity-50"
                      >
                        {busy === 'cancel-match' ? 'Cancelling…' : 'Cancel & refund'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {match.status === 'INTERMISSION' ? (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ffdf1a]/20 bg-[#ffdf1a]/[0.06] px-3 py-2.5">
                  <div>
                    <p className="text-[12px] font-bold text-[#ffdf1a]">
                      Both players busted — replaying with the same stakes
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/55">
                      Next round in {secondsUntil(match.intermissionEndsAt, match.serverNow)}s. No
                      fee is charged until a winner exists.
                    </p>
                  </div>
                  {match.viewer.canCancel ? (
                    <button
                      type="button"
                      onClick={cancelMatch}
                      disabled={busy === 'cancel-match'}
                      className="h-8 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[10px] font-semibold text-white/65 transition hover:border-white/25 disabled:opacity-50"
                    >
                      Stop replaying
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2.5">
                {match.status === 'RUNNING' ? (
                  <button
                    type="button"
                    onClick={cashout}
                    disabled={!match.viewer.canCashOut || busy === 'cashout'}
                    className={`dual-cashout flex h-14 w-full items-center justify-between rounded-xl px-5 transition ${
                      match.viewer.canCashOut
                        ? 'bg-[var(--t-green)] text-[var(--t-green-ink)] shadow-[0_0_34px_rgba(0,250,127,0.24)] hover:brightness-110 active:scale-[0.995]'
                        : 'border border-white/[0.08] bg-white/[0.03] text-white/45'
                    }`}
                  >
                    <span className="text-left">
                      <span className="block text-[15px] font-black uppercase tracking-[0.1em]">
                        {match.viewer.hasCashedOut
                          ? 'Cashed out'
                          : match.viewer.canCashOut
                            ? 'Cash out'
                            : 'Waiting for the round'}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-medium opacity-70">
                        {match.viewer.hasCashedOut && match.viewer.cashoutMultiplierX100 != null
                          ? `Locked at ${formatMultiplier(match.viewer.cashoutMultiplierX100)} — last cashout wins`
                          : `Last cashout takes ${usd(match.potPusd)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-right">
                      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60 sm:block">
                        Space
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          d="M5 12h13M13 6l6 6-6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                ) : match.status === 'COUNTDOWN' ? (
                  <div className="flex h-14 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4">
                    <div>
                      <p className="text-[12px] font-bold text-white">Stakes locked</p>
                      <p className="mt-0.5 text-[10px] text-[var(--t-muted)]">
                        Both players are ready. The rocket launches automatically.
                      </p>
                    </div>
                    <span className="rounded-lg border border-[#00fa7f]/20 bg-[#00fa7f]/10 px-2 py-1 text-[10px] font-bold text-[#00fa7f]">
                      {Math.max(1, Math.ceil((match.countdownMsRemaining ?? 0) / 1_000))}s
                    </span>
                  </div>
                ) : match.status === 'SETTLED' ? (
                  <div className="flex h-14 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4">
                    <div>
                      <p className="text-[12px] font-bold text-white">
                        {match.winnerUserId === selfId ? 'You won the pot' : 'Round settled'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--t-muted)]">
                        Rematch requires both players to agree.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={rematch}
                      disabled={busy != null || selfPlayer?.rematchRequested}
                      className="h-8 rounded-lg bg-[var(--t-green)] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--t-green-ink)] transition hover:brightness-110 disabled:opacity-45"
                    >
                      {selfPlayer?.rematchRequested ? 'Requested' : 'Rematch'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="order-3 hidden lg:block">{rightPanel}</div>
          </div>

          <div className="mt-2.5 lg:hidden">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]">
              <span className="text-[var(--t-muted)]">Winner gets</span>
              <span className="font-bold text-[#00fa7f]">{usd(match.payoutPusd)}</span>
              <span className="text-[var(--t-muted)]">Fee</span>
              <span className="text-white/70">{usd(match.feePusd)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {match && (match.status === 'SETTLED' || match.status === 'CANCELLED') ? (
        <ResultOverlay
          match={match}
          busy={busy}
          onRematch={rematch}
          onDecline={declineRematch}
          onLeave={leave}
          onDispute={dispute}
        />
      ) : null}

      {!authRequired && !loading && state ? (
        <FairnessPanel
          key={`${match?.id ?? 'none'}:${match?.round ?? 0}:${match?.serverSeed ?? 'hidden'}`}
          clientSeed={state.user.clientSeed}
          match={match}
          busy={busy === 'seed'}
          onRegenerate={regenerateSeed}
        />
      ) : null}

      <HistoryPanel refreshKey={historyKey} />

      {opponent ? (
        <p className="px-1 text-center text-[10px] text-[var(--t-muted)]">
          Opponent: <span className="text-white/55">{opponent.displayName}</span> · cashout timing
          is hidden until the round ends.
        </p>
      ) : null}
    </div>
  )
}
