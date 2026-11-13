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

function secondsUntil(iso: string | null, clockOffsetMs: number): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - (Date.now() + clockOffsetMs)) / 1_000))
}

export function DualGame() {
  const [state, setState] = useState<DualStateResponse | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [stake, setStake] = useState(() => formatPusdUnits(DUAL_DEFAULT_STAKE_PUSD))
  // Estimated `serverNow - localNow`, corrected for the round-trip time of the
  // poll. Without this the rocket lags by the whole request latency (which can
  // be tens of seconds on a slow database link).
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [localCashout, setLocalCashout] = useState<{
    key: string
    multiplierX100: number
  } | null>(null)
  // Re-renders the action bar while a round is in flight, so the cash-out
  // button unlocks on the local clock instead of waiting for the next poll.
  const [nowTick, setNowTick] = useState(() => Date.now())

  const authRef = useRef(false)
  const readyKeyRef = useRef<string | null>(null)
  const previousRef = useRef<{ matchId?: string; status?: DualStatus; round?: number }>({})
  const tickRef = useRef<number | null>(null)
  const { play } = useDualAudio()

  const refresh = useCallback(async (): Promise<DualStateResponse | null> => {
    try {
      const response = await fetch('/api/dual/state', {
        cache: 'no-store',
        // A hanging request must not freeze the whole polling loop.
        signal: AbortSignal.timeout(25_000),
      })
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
      const serverNowMs = new Date(stateData.serverNow).getTime()
      if (Number.isFinite(serverNowMs)) {
        // `serverNow` is stamped right before the response is serialised, so
        // measure against the moment it arrived. Averaging with the send time
        // would make the rocket lead the server by half the request latency.
        setClockOffsetMs(serverNowMs - Date.now())
      }
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
              signal: AbortSignal.timeout(20_000),
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

    const beat = async () => {
      if (control.cancelled) return
      try {
        await fetch('/api/dual/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId }),
          cache: 'no-store',
          keepalive: true,
          signal: AbortSignal.timeout(20_000),
        })
      } catch {
        // The next tick retries; a failed ping must never break the UI.
      }
    }

    // Fire on a fixed interval instead of chaining after each response: on a
    // slow link one heartbeat can take 15s, which would otherwise push the next
    // ping outside the disconnect grace window.
    beat()
    const timer = window.setInterval(beat, DUAL_HEARTBEAT_MS)
    return () => {
      control.cancelled = true
      window.clearInterval(timer)
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
          signal: AbortSignal.timeout(25_000),
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
        setNotice({ tone: 'error', text: 'Network error.' })
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

  const roundKey = match ? `${match.id}:${match.round}` : null
  const startsAtMs = match?.startsAt ? new Date(match.startsAt).getTime() : null
  const localNowMs = nowTick + clockOffsetMs
  // The clock decides when the rocket leaves, not the last poll: the server only
  // flips COUNTDOWN -> RUNNING when a request reaches it, and that can be many
  // seconds after the scheduled launch on a slow link.
  const locallyFlying =
    match != null &&
    startsAtMs != null &&
    localNowMs >= startsAtMs &&
    (match.status === 'RUNNING' || match.status === 'COUNTDOWN')
  const localCashoutX100 =
    localCashout && roundKey === localCashout.key ? localCashout.multiplierX100 : null
  const cashoutLocked = match?.viewer.hasCashedOut === true || localCashoutX100 != null
  const shownCashoutX100 = localCashoutX100 ?? match?.viewer.cashoutMultiplierX100 ?? null
  const canPressCashOut = locallyFlying && !cashoutLocked && busy !== 'cashout'
  const activeMatchStatus = match?.status ?? null

  useEffect(() => {
    if (
      activeMatchStatus !== 'COUNTDOWN' &&
      activeMatchStatus !== 'RUNNING' &&
      activeMatchStatus !== 'INTERMISSION'
    ) {
      return
    }
    setNowTick(Date.now())
    const timer = window.setInterval(() => setNowTick(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [activeMatchStatus, match?.id, match?.round])

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
    const key = `${match.id}:${match.round}`
    const result = await mutate('/api/dual/cashout', 'POST', { matchId: match.id }, 'cashout')
    if (result) {
      const multiplier = Number(result.multiplierX100 ?? 0)
      setLocalCashout({ key, multiplierX100: multiplier })
      play('cashout')
      setNotice({
        tone: 'success',
        text: `Cashed out at ${formatMultiplier(multiplier)}.`,
      })
    }
  }, [match, mutate, play])

  useEffect(() => {
    if (!canPressCashOut) return
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      void cashout()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canPressCashOut, cashout])

  const cancelMatch = useCallback(async () => {
    if (!match) return
    await mutate('/api/dual/cancel', 'POST', { matchId: match.id }, 'cancel-match')
  }, [match, mutate])

  const leave = useCallback(async () => {
    if (!match) return
    const result = await mutate('/api/dual/leave', 'POST', { matchId: match.id }, 'leave')
    if (result) setNotice({ tone: 'info', text: 'Match closed.' })
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
      if (result.matchId) setNotice({ tone: 'success', text: 'Rematch requested.' })
      else play('click')
    }
  }, [match, mutate, play])

  const declineRematch = useCallback(async () => {
    if (!match) return
    await mutate('/api/dual/rematch', 'POST', { matchId: match.id, action: 'decline' }, 'decline')
  }, [match, mutate])

  const regenerateSeed = useCallback(async () => {
    const result = await mutate('/api/dual/client-seed', 'POST', null, 'seed')
    if (result) setNotice({ tone: 'success', text: 'New seed.' })
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
        text: result.cancelled ? 'Match cancelled and refunded.' : 'Dispute submitted.',
      })
    }
  }, [match, mutate])

  const historyKey = match ? `${match.id}:${match.status}:${match.round}` : 'idle'
  const showLobby = !match && !state?.queue

  return (
    <div className="space-y-3">
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
            Check your connection and retry.
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
        <section className="dual-card p-3 sm:p-4">
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
            <p className="text-[11px] font-semibold text-white/55">Pot {usd(match.potPusd)}</p>
          </div>

          <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_210px]">
            <div className="order-1 min-w-0">
              <div className="relative">
                <CrashStage
                  status={match.status}
                  startsAt={match.startsAt}
                  crashMultiplierX100={match.crashMultiplierX100}
                  currentMultiplierX100={match.currentMultiplierX100}
                  countdownMsRemaining={match.countdownMsRemaining}
                  clockOffsetMs={clockOffsetMs}
                  round={match.round}
                  historyKey={historyKey}
                />

                {match.status === 'WAITING' ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-xl bg-[#050914]/80 p-4 text-center backdrop-blur-sm">
                    <span className="dual-spinner h-7 w-7 rounded-full border-2 border-[#00fa7f]/25 border-t-[#00fa7f]" />
                    <p className="mt-3 text-sm font-bold text-white">Waiting for opponent</p>
                    <div className="mt-2 flex items-center gap-3 text-[10px]">
                      {match.players.map((player) => (
                        <span
                          key={player.userId}
                          className="flex items-center gap-1.5 text-white/60"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${player.ready ? 'bg-[#00fa7f]' : 'bg-white/25'}`}
                          />
                          {player.isSelf ? 'You' : 'Opponent'}
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
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#ffdf1a]/20 bg-[#ffdf1a]/[0.06] px-3 py-2">
                  <p className="text-[12px] font-bold text-[#ffdf1a]">
                    Both busted · replay in{' '}
                    {secondsUntil(match.intermissionEndsAt, clockOffsetMs)}s
                  </p>
                  {match.viewer.canCancel ? (
                    <button
                      type="button"
                      onClick={cancelMatch}
                      disabled={busy === 'cancel-match'}
                      className="h-7 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 text-[10px] font-semibold text-white/65 transition hover:border-white/25 disabled:opacity-50"
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2.5">
                {locallyFlying ? (
                  <button
                    type="button"
                    onClick={cashout}
                    disabled={!canPressCashOut}
                    className={`dual-cashout flex h-12 w-full items-center justify-center gap-3 rounded-xl px-4 text-[14px] font-black uppercase tracking-[0.1em] transition ${
                      canPressCashOut
                        ? 'bg-[var(--t-green)] text-[var(--t-green-ink)] shadow-[0_0_34px_rgba(0,250,127,0.24)] hover:brightness-110 active:scale-[0.995]'
                        : 'border border-white/[0.08] bg-white/[0.03] text-white/45'
                    }`}
                  >
                    <span>
                      {busy === 'cashout'
                        ? 'Cashing out…'
                        : cashoutLocked
                          ? shownCashoutX100 != null
                            ? `Cashed out at ${formatMultiplier(shownCashoutX100)}`
                            : 'Cashed out'
                          : 'Cash out'}
                    </span>
                    {canPressCashOut ? (
                      <span className="hidden text-[10px] font-semibold tracking-[0.12em] opacity-60 sm:inline">
                        Space
                      </span>
                    ) : null}
                  </button>
                ) : match.status === 'COUNTDOWN' ? (
                  <div className="flex h-12 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4">
                    <span className="text-[12px] font-bold text-white">Launching</span>
                    <span className="rounded-lg border border-[#00fa7f]/20 bg-[#00fa7f]/10 px-2 py-1 text-[10px] font-bold text-[#00fa7f]">
                      {Math.max(1, Math.ceil(((startsAtMs ?? localNowMs) - localNowMs) / 1_000))}s
                    </span>
                  </div>
                ) : match.status === 'SETTLED' ? (
                  <div className="flex h-12 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4">
                    <span className="text-[12px] font-bold text-white">
                      {match.winnerUserId === selfId
                        ? `You won ${usd(match.payoutPusd)}`
                        : 'Round settled'}
                    </span>
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

            <div className="order-2 grid grid-cols-2 gap-2.5 lg:grid-cols-1 lg:content-start">
              {match.players.map((player) => (
                <PlayerCard
                  key={player.userId}
                  player={player}
                  status={match.status}
                  winnerUserId={match.winnerUserId}
                />
              ))}
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
    </div>
  )
}
