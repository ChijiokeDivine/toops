'use client'

import { useEffect, useRef, useState } from 'react'
import { DUAL_GROWTH_RATE_PER_SECOND, DUAL_MAX_MULTIPLIER_X100 } from '@/lib/dual/config'
import {
  elapsedMsForMultiplierX100,
  formatMultiplier,
  multiplierX100AtElapsed,
} from '@/lib/dual/curve'
import type { DualHistoryItem, DualStatus } from '@/lib/dual/types'
import { ChartRocket } from './chart-rocket'

type CrashStageProps = {
  status: DualStatus
  startsAt: string | null
  crashMultiplierX100: number | null
  currentMultiplierX100: number
  countdownMsRemaining: number | null
  /**
   * `serverNow - localNow` in milliseconds, measured with the round-trip time
   * of the poll taken into account. Using the raw `serverNow` string makes the
   * rocket lag by the whole request latency on a slow connection.
   */
  clockOffsetMs: number
  round: number
  /** Changes whenever a round ends, so the recent-crash pills refresh. */
  historyKey: string
}

const VIEW_W = 1000
const VIEW_H = 600
const SAMPLES = 80
const MIN_WINDOW_MS = 30_000

function formatAxis(value: number): string {
  return `${value.toFixed(1)}x`
}

function historyLabel(valueX100: number): string {
  return formatMultiplier(valueX100).replace('x', '')
}

export function CrashStage({
  status,
  startsAt,
  crashMultiplierX100,
  currentMultiplierX100,
  countdownMsRemaining,
  clockOffsetMs,
  round,
  historyKey,
}: CrashStageProps) {
  const [displayX100, setDisplayX100] = useState(100)
  const displayRef = useRef(100)
  const [history, setHistory] = useState<number[]>([])
  const appendedRoundRef = useRef<number | null>(null)

  const propsRef = useRef<CrashStageProps>({
    status,
    startsAt,
    crashMultiplierX100,
    currentMultiplierX100,
    countdownMsRemaining,
    clockOffsetMs,
    round,
    historyKey,
  })

  useEffect(() => {
    propsRef.current = {
      status,
      startsAt,
      crashMultiplierX100,
      currentMultiplierX100,
      countdownMsRemaining,
      clockOffsetMs,
      round,
      historyKey,
    }
  }, [
    status,
    startsAt,
    crashMultiplierX100,
    currentMultiplierX100,
    countdownMsRemaining,
    clockOffsetMs,
    round,
    historyKey,
  ])
  // The replay that plays the missing flight when the first response for a
  // round already contains the crash result (a slow poll can skip RUNNING).
  const catchUpRef = useRef<{
    key: string
    from: number
    startedAt: number
    target: number
  } | null>(null)

  useEffect(() => {
    const raf = { id: 0 }
    const paint = { last: 0 }

    const tick = (time: number) => {
      const props = propsRef.current
      const now = Date.now() + props.clockOffsetMs
      const startsAtMs = props.startsAt ? new Date(props.startsAt).getTime() : null
      // The clock is the source of truth for the flight, not the poll status:
      // the server only flips COUNTDOWN -> RUNNING when a request arrives, and
      // on a slow link that can be seconds after the rocket actually left.
      const flying =
        startsAtMs != null &&
        now >= startsAtMs &&
        (props.status === 'RUNNING' || props.status === 'COUNTDOWN')
      const crashed = props.status === 'SETTLED' || props.status === 'INTERMISSION'

      let next = displayRef.current

      if (flying) {
        catchUpRef.current = null
        next = Math.min(multiplierX100AtElapsed(now - startsAtMs!), DUAL_MAX_MULTIPLIER_X100)
      } else if (crashed) {
        const target = props.crashMultiplierX100 ?? props.currentMultiplierX100
        const key = `${props.round}:${props.status}`
        const active = catchUpRef.current

        if (active?.key !== key) {
          // Only replay when the client never got to see the flight; otherwise
          // the last frame is already at (or past) the crash point.
          if (displayRef.current < target * 0.9 && target > 130) {
            catchUpRef.current = {
              key,
              from: displayRef.current,
              startedAt: time,
              target,
            }
          } else {
            catchUpRef.current = null
          }
        }

        const run = catchUpRef.current
        if (run && run.key === key) {
          const progress = Math.min(1, (time - run.startedAt) / 900)
          const eased = 1 - Math.pow(1 - progress, 3)
          next = run.from + (run.target - run.from) * eased
          if (progress >= 1) {
            next = run.target
            catchUpRef.current = null
          }
        } else {
          next =
            Math.abs(target - displayRef.current) < 0.5
              ? target
              : displayRef.current + (target - displayRef.current) * 0.2
        }
      } else {
        catchUpRef.current = null
        next =
          Math.abs(100 - displayRef.current) < 0.5
            ? 100
            : displayRef.current + (100 - displayRef.current) * 0.14
      }

      displayRef.current = next

      if (time - paint.last > 28) {
        paint.last = time
        setDisplayX100(Math.max(100, Math.round(next)))
      }
      raf.id = requestAnimationFrame(tick)
    }

    raf.id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.id)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/dual/history?limit=7', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = (await response.json()) as { matches?: DualHistoryItem[] }
        const values = (data.matches ?? [])
          .map((item) => item.crashMultiplierX100)
          .filter((value): value is number => value != null)
        setHistory(values.slice(0, 7))
      } catch {
        // Pills are decorative; a failed fetch leaves the previous list.
      }
    })()
    return () => controller.abort()
  }, [historyKey])

  const startsAtMs = startsAt ? new Date(startsAt).getTime() : null
  // Re-read the clock on every paint: the animation loop re-renders this
  // component every ~28ms, so the value is always fresh while the rocket flies.
  // oxlint-disable-next-line react/purity
  const nowMs = Date.now() + clockOffsetMs
  const locallyFlying =
    startsAtMs != null && nowMs >= startsAtMs && (status === 'RUNNING' || status === 'COUNTDOWN')
  const ended = status === 'SETTLED' || status === 'INTERMISSION'
  const crashTargetX100 = ended ? (crashMultiplierX100 ?? currentMultiplierX100) : null
  const arrivedAtCrash = crashTargetX100 != null && displayX100 >= crashTargetX100 - 1
  const launchMsRemaining =
    startsAtMs != null ? Math.max(0, startsAtMs - nowMs) : (countdownMsRemaining ?? 0)

  useEffect(() => {
    if (!ended || crashTargetX100 == null || appendedRoundRef.current === round) return
    appendedRoundRef.current = round
    setHistory((previous) =>
      previous[0] === crashTargetX100 ? previous : [crashTargetX100, ...previous].slice(0, 7),
    )
  }, [ended, crashTargetX100, round])

  const elapsed = Math.max(elapsedMsForMultiplierX100(displayX100), 1)
  const crashElapsed = crashTargetX100
    ? Math.max(elapsedMsForMultiplierX100(crashTargetX100), elapsed)
    : elapsed
  const windowMs =
    Math.max(MIN_WINDOW_MS, Math.ceil(crashElapsed / 30_000) * 30_000) || MIN_WINDOW_MS
  const peakX100 = Math.max(displayX100, crashTargetX100 ?? displayX100)
  const axisMax = Math.max(2, Math.ceil((peakX100 / 100) * 1.15))

  let curve = ''
  let lastX = 0
  let lastY = VIEW_H
  let prevX = 0
  let prevY = VIEW_H

  for (let index = 0; index <= SAMPLES; index++) {
    prevX = lastX
    prevY = lastY
    const timeMs = (elapsed * index) / SAMPLES
    const multiplier = Math.exp(DUAL_GROWTH_RATE_PER_SECOND * (timeMs / 1_000))
    const x = (timeMs / windowMs) * VIEW_W
    const y = VIEW_H - Math.min(1, multiplier / axisMax) * VIEW_H
    curve += `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `
    lastX = x
    lastY = y
  }

  // Tangent at the tip, so the rocket sits on the line instead of floating.
  const angleDeg = Math.min(
    82,
    Math.max(8, (Math.atan2(lastX - prevX, prevY - lastY) * 180) / Math.PI),
  )

  const area = `${curve} L ${lastX.toFixed(1)} ${VIEW_H} L 0 ${VIEW_H} Z`
  const accent = ended ? '#f63c45' : '#00fa7f'

  const statusLabel = ended
    ? 'Crashed'
    : status === 'CANCELLED'
      ? 'Cancelled'
      : locallyFlying
        ? 'Live'
        : status === 'COUNTDOWN'
          ? 'Launching'
          : status === 'WAITING'
            ? 'Waiting'
            : 'Ready'

  const axisTicks = [0.25, 0.5, 0.75].map((ratio) => axisMax * ratio)
  const timeTicks = [1 / 3, 2 / 3, 1].map((ratio) => Math.round((windowMs * ratio) / 1_000))

  return (
    <div className="relative isolate flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1116] lg:min-h-[500px]">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-[#0f151b] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              ended
                ? 'bg-[#ff4d57] shadow-[0_0_10px_rgba(255,77,87,0.9)]'
                : 'bg-[#00ff86] shadow-[0_0_10px_rgba(0,255,134,0.9)]'
            }`}
          />
          <span className="text-[13px] font-semibold text-white">{statusLabel}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(history.length > 0 ? history : [0]).map((value, index) => {
            const hot = value >= 200
            return (
              <span
                key={`${value}-${index}`}
                className={`flex h-[30px] min-w-[60px] items-center justify-center rounded-full px-3 text-[14px] font-bold tabular-nums ${
                  value === 0
                    ? 'bg-[#252f3a] text-[#6f7a87]'
                    : hot
                      ? 'bg-[#00ff86] text-[#03170d]'
                      : 'bg-[#252f3a] text-[#e6e9ed]'
                }`}
              >
                {value === 0 ? '—' : historyLabel(value)}
              </span>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="relative flex-1 select-none">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Rocket multiplier at ${formatMultiplier(displayX100)}`}
        >
          <defs>
            <linearGradient id="crash-live-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {axisTicks.map((value) => {
            const y = VIEW_H - (value / axisMax) * VIEW_H
            return (
              <line
                key={`h-${value}`}
                x1={0}
                x2={VIEW_W}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.07)"
                strokeDasharray="5 9"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          {[1 / 3, 2 / 3].map((ratio) => (
            <line
              key={`v-${ratio}`}
              x1={ratio * VIEW_W}
              x2={ratio * VIEW_W}
              y1={0}
              y2={VIEW_H}
              stroke="rgba(255,255,255,0.035)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={VIEW_W}
            y1={VIEW_H}
            y2={VIEW_H}
            stroke="rgba(255,255,255,0.1)"
            vectorEffect="non-scaling-stroke"
          />

          <path d={area} fill="url(#crash-live-area)" />
          <path
            d={curve}
            fill="none"
            stroke={accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              filter: `drop-shadow(0 0 6px ${ended ? 'rgba(246,60,69,0.45)' : 'rgba(0,250,127,0.45)'})`,
            }}
          />
        </svg>

        <ChartRocket
          leftPct={(lastX / VIEW_W) * 100}
          topPct={(lastY / VIEW_H) * 100}
          angleDeg={angleDeg}
          crashed={ended && arrivedAtCrash}
        />

        {/* Y axis */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {axisTicks.map((value) => {
            const top = (1 - value / axisMax) * 100
            return (
              <div
                key={`y-${value}`}
                className="absolute left-3 flex -translate-y-1/2 items-center gap-2"
                style={{ top: `${top}%` }}
              >
                <span className="h-px w-3 bg-white/25" />
                <span className="text-[11px] font-bold text-[#cfd4da]">{formatAxis(value)}</span>
              </div>
            )
          })}
          {Array.from({ length: 13 }, (_, index) => (
            <span
              key={index}
              className="absolute left-1 h-px w-2 bg-white/15"
              style={{ top: `${(1 - (index + 1) / 14) * 100}%` }}
            />
          ))}
        </div>

        {/* X axis */}
        <div className="pointer-events-none absolute inset-x-0 bottom-2" aria-hidden="true">
          {timeTicks.map((seconds, index) => (
            <span
              key={seconds}
              className={`absolute text-[11px] font-semibold text-white/45 ${
                index === 2 ? 'right-2' : '-translate-x-1/2'
              }`}
              style={index === 2 ? undefined : { left: `${((index + 1) / 3) * 100}%` }}
            >
              {seconds}s
            </span>
          ))}
        </div>

        {/* Center readout */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10 text-center">
          {ended ? (
            <span className="text-[22px] font-semibold text-white sm:text-[26px]">Crashed</span>
          ) : null}
          <span
            className={`font-bold leading-none tabular-nums tracking-tight ${
              ended ? 'mt-1 text-[56px] text-[#ff3d47] sm:text-[68px]' : 'text-[46px] text-white'
            }`}
          >
            {formatMultiplier(displayX100)}
          </span>
        </div>
      </div>

      {status === 'COUNTDOWN' && !locallyFlying ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050914]/60 backdrop-blur-[2px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/45">
            Launching in
          </span>
          <span
            key={Math.ceil(launchMsRemaining / 1_000)}
            className="dual-countdown mt-2 text-[86px] font-black leading-none text-white"
          >
            {Math.max(1, Math.ceil(launchMsRemaining / 1_000))}
          </span>
        </div>
      ) : null}
    </div>
  )
}
