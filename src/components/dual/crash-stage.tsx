'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DUAL_GROWTH_RATE_PER_SECOND,
  DUAL_MAX_MULTIPLIER_X100,
} from '@/lib/dual/config'
import { elapsedMsForMultiplierX100, formatMultiplier, multiplierX100AtElapsed } from '@/lib/dual/curve'
import type { DualStatus } from '@/lib/dual/types'

type CrashStageProps = {
  status: DualStatus
  startsAt: string | null
  crashMultiplierX100: number | null
  currentMultiplierX100: number
  countdownMsRemaining: number | null
  serverNow: string
  round: number
  outcome: 'win' | 'lose' | 'neutral'
}

const WIDTH = 800
const HEIGHT = 340
const MARGIN_X = 28
const MARGIN_Y = 30
const PLOT_W = WIDTH - MARGIN_X * 2
const PLOT_H = HEIGHT - MARGIN_Y * 2
const POINTS = 64

function seeded(seed: number) {
  let state = Math.abs(Math.floor(seed)) % 2_147_483_647 || 1
  return () => {
    state = (state * 16_807) % 2_147_483_647
    return state / 2_147_483_647
  }
}

export function CrashStage({
  status,
  startsAt,
  crashMultiplierX100,
  currentMultiplierX100,
  countdownMsRemaining,
  serverNow,
  round,
  outcome,
}: CrashStageProps) {
  const [displayX100, setDisplayX100] = useState(100)
  const displayRef = useRef(100)
  const propsRef = useRef<CrashStageProps>({
    status,
    startsAt,
    crashMultiplierX100,
    currentMultiplierX100,
    countdownMsRemaining,
    serverNow,
    round,
    outcome,
  })

  useEffect(() => {
    propsRef.current = {
      status,
      startsAt,
      crashMultiplierX100,
      currentMultiplierX100,
      countdownMsRemaining,
      serverNow,
      round,
      outcome,
    }
  }, [
    status,
    startsAt,
    crashMultiplierX100,
    currentMultiplierX100,
    countdownMsRemaining,
    serverNow,
    round,
    outcome,
  ])

  useEffect(() => {
    const raf = { id: 0 }
    const paint = { last: 0 }

    const tick = (time: number) => {
      const props = propsRef.current
      const offset = new Date(props.serverNow).getTime() - Date.now()
      const running = props.status === 'RUNNING' && props.startsAt != null

      let target = props.currentMultiplierX100
      if (running) {
        target = multiplierX100AtElapsed(
          Date.now() + offset - new Date(props.startsAt!).getTime(),
        )
        target = Math.min(target, DUAL_MAX_MULTIPLIER_X100)
      } else if (props.status === 'SETTLED' || props.status === 'INTERMISSION') {
        target = props.crashMultiplierX100 ?? props.currentMultiplierX100
      } else if (props.status === 'WAITING' || props.status === 'COUNTDOWN') {
        target = 100
      }

      const current = displayRef.current
      const next = running
        ? target
        : Math.abs(target - current) < 0.5
          ? target
          : current + (target - current) * 0.14
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

  const stars = useMemo(() => {
    const random = seeded(round * 97 + 13)
    return Array.from({ length: 38 }, (_, index) => ({
      id: index,
      x: MARGIN_X + random() * PLOT_W,
      y: MARGIN_Y + random() * PLOT_H * 0.82,
      r: 0.7 + random() * 1.6,
      opacity: 0.18 + random() * 0.55,
      delay: random() * 4,
    }))
  }, [round])

  const ended = status === 'SETTLED' || status === 'INTERMISSION'
  const maxMultiplier = Math.max(displayX100 / 100, 2)
  const elapsed = elapsedMsForMultiplierX100(Math.max(displayX100, 100))
  const effectiveElapsed = Math.max(elapsed, 1)

  let curve = ''
  let lastX = MARGIN_X
  let lastY = HEIGHT - MARGIN_Y

  for (let index = 0; index <= POINTS; index++) {
    const progress = index / POINTS
    const t = effectiveElapsed * progress
    const multiplier = Math.exp(DUAL_GROWTH_RATE_PER_SECOND * (t / 1_000))
    const x = MARGIN_X + PLOT_W * progress
    const y =
      HEIGHT -
      MARGIN_Y -
      Math.min(1, Math.max(0, (multiplier - 1) / (maxMultiplier - 1))) * PLOT_H
    curve += `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `
    lastX = x
    lastY = y
  }

  const area = `${curve} L ${lastX.toFixed(1)} ${(HEIGHT - MARGIN_Y).toFixed(1)} L ${MARGIN_X} ${(HEIGHT - MARGIN_Y).toFixed(1)} Z`

  const accent = outcome === 'win' ? '#ffdf1a' : ended ? '#ff5b6e' : '#00fa7f'
  const gradientId = `dual-trail-${round}`
  const areaId = `dual-area-${round}`
  const glowId = `dual-glow-${round}`

  const multiplierClass =
    outcome === 'win'
      ? 'text-[#ffdf1a]'
      : ended
        ? 'text-[#ff6b7c]'
        : status === 'CANCELLED'
          ? 'text-white/50'
          : 'text-white'

  const label = ended
    ? 'CRASHED AT'
    : status === 'CANCELLED'
      ? 'CANCELLED'
      : status === 'RUNNING'
      ? 'LIVE MULTIPLIER'
      : status === 'COUNTDOWN'
        ? 'LAUNCHING'
        : 'MULTIPLIER'

  return (
    <div className="dual-stage relative isolate overflow-hidden rounded-2xl border border-white/[0.06]">
      <div className="dual-stage-glow" aria-hidden="true" />
      <div className="dual-stage-stars" aria-hidden="true" />

      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
          {label}
        </span>
        <span
          className={`dual-multiplier mt-1 text-[42px] font-black leading-none tabular-nums sm:text-[58px] ${multiplierClass} ${
            status === 'RUNNING' ? 'dual-multiplier-live' : ''
          }`}
        >
          {formatMultiplier(displayX100)}
        </span>
        {status === 'RUNNING' ? (
          <span className="mt-2 rounded-full border border-[#00fa7f]/30 bg-[#00fa7f]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#00fa7f]">
            Rocket in flight
          </span>
        ) : null}
        {status === 'INTERMISSION' ? (
          <span className="mt-2 rounded-full border border-[#ffdf1a]/30 bg-[#ffdf1a]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ffdf1a]">
            Both busted · replaying
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="relative z-10 block h-[300px] w-full sm:h-[340px]"
        role="img"
        aria-label={`Rocket multiplier chart at ${formatMultiplier(displayX100)}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0fd486" stopOpacity="0.25" />
            <stop offset="55%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="100%" stopColor={accent} />
          </linearGradient>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.24" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={MARGIN_X}
            x2={WIDTH - MARGIN_X}
            y1={MARGIN_Y + PLOT_H * ratio}
            y2={MARGIN_Y + PLOT_H * ratio}
            stroke="rgba(255,255,255,0.055)"
            strokeDasharray="4 8"
          />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line
            key={ratio}
            x1={MARGIN_X + PLOT_W * ratio}
            x2={MARGIN_X + PLOT_W * ratio}
            y1={MARGIN_Y}
            y2={HEIGHT - MARGIN_Y}
            stroke="rgba(255,255,255,0.035)"
          />
        ))}
        <line
          x1={MARGIN_X}
          x2={WIDTH - MARGIN_X}
          y1={HEIGHT - MARGIN_Y}
          y2={HEIGHT - MARGIN_Y}
          stroke="rgba(255,255,255,0.12)"
        />

        {stars.map((star) => (
          <circle
            key={star.id}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill="white"
            opacity={star.opacity}
            className="dual-star"
            style={{ animationDelay: `${star.delay}s` }}
          />
        ))}

        <path d={area} fill={`url(#${areaId})`} />
        <path
          d={curve}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={ended ? undefined : `url(#${glowId})`}
          className="dual-trail"
        />

        {!ended ? (
          <g transform={`translate(${lastX.toFixed(1)} ${lastY.toFixed(1)}) rotate(35)`}>
            <g className="dual-rocket">
              <path
                d="M0 -18 C10 -8 10 5 0 17 C-10 5 -10 -8 0 -18Z"
                fill="#f8fbff"
                stroke="rgba(0,0,0,0.18)"
                strokeWidth="0.6"
              />
              <path d="M-7 8 L-14 18 L-5 15Z" fill="#ff8a00" />
              <path d="M7 8 L14 18 L5 15Z" fill="#ff8a00" />
              <circle cx="0" cy="-3" r="3.2" fill="#0b1220" stroke="#8fe9ff" strokeWidth="1" />
              <path d="M0 17 L-3.5 26 L0 23.5 L3.5 26Z" fill="#ffdf1a" className="dual-flame" />
            </g>
          </g>
        ) : (
          <g
            key={`${round}-${status}`}
            transform={`translate(${lastX.toFixed(1)} ${lastY.toFixed(1)})`}
          >
            <g className="dual-burst">
              <circle r="18" fill="none" stroke="#ff6b7c" strokeWidth="2" opacity="0.8" />
              <circle r="34" fill="none" stroke="#ff8a00" strokeWidth="1.5" opacity="0.5" />
              <circle r="52" fill="none" stroke="#ffdf1a" strokeWidth="1" opacity="0.3" />
              <circle r="7" fill="#ff6b7c" />
            </g>
          </g>
        )}
      </svg>

      {status === 'COUNTDOWN' ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050914]/55 backdrop-blur-[2px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/45">
            Launching in
          </span>
          <span
            key={Math.ceil((countdownMsRemaining ?? 0) / 1_000)}
            className="dual-countdown mt-2 text-[86px] font-black leading-none text-white"
          >
            {Math.max(1, Math.ceil((countdownMsRemaining ?? 0) / 1_000))}
          </span>
          <span className="mt-2 text-xs font-medium text-[#00fa7f]/80">
            Stakes are locked · get ready
          </span>
        </div>
      ) : null}

      {ended ? <div className="dual-crash-flash pointer-events-none absolute inset-0 z-20" aria-hidden="true" /> : null}
    </div>
  )
}
