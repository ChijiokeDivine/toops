'use client'

import { useEffect, useState } from 'react'
import { ChartRocket } from './chart-rocket'

/**
 * Ambient, non-interactive crash demo shown next to the stake form. It mirrors
 * the reference layout: a status bar with recent multiplier pills and a chart
 * that loops through "flying" and "crashed" phases on its own.
 */

const WINDOW_MS = 30_000
const HOLD_MS = 2_200
const AXIS_MAX = 8
const VIEW_W = 1000
const VIEW_H = 600
const SAMPLES = 80

const SEED_HISTORY = [639, 627, 5834, 145, 139, 225, 164]

type Frame = {
  elapsedMs: number
  durationMs: number
  crashX100: number
  crashed: boolean
}

function formatX(valueX100: number): string {
  return (valueX100 / 100).toFixed(2)
}

export function CrashDemo() {
  const [history, setHistory] = useState<number[]>(SEED_HISTORY)
  const [frame, setFrame] = useState<Frame>({
    elapsedMs: 0,
    durationMs: 1,
    crashX100: SEED_HISTORY[0],
    crashed: false,
  })

  useEffect(() => {
    let raf = 0
    let startedAt = 0
    let durationMs = 1
    let crashX100 = SEED_HISTORY[0]
    let crashedAt = 0
    let phase: 'flying' | 'crashed' = 'flying'
    let lastPaint = 0

    const begin = (now: number) => {
      startedAt = now
      // Rounds last 16-30s; the chart always spans a 30s window, exactly like
      // the reference where the curve stops where the round crashed.
      durationMs = 16_000 + Math.random() * 14_000
      crashX100 = Math.round(130 + Math.pow(Math.random(), 0.9) * 540)
      phase = 'flying'
      setFrame({ elapsedMs: 0, durationMs, crashX100, crashed: false })
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)

      if (!startedAt) {
        begin(now)
        return
      }

      if (phase === 'crashed') {
        if (now - crashedAt >= HOLD_MS) begin(now)
        return
      }

      const elapsedMs = now - startedAt
      if (elapsedMs >= durationMs) {
        phase = 'crashed'
        crashedAt = now
        setFrame({ elapsedMs: durationMs, durationMs, crashX100, crashed: true })
        setHistory((previous) => [crashX100, ...previous].slice(0, 7))
        return
      }

      if (now - lastPaint >= 50) {
        lastPaint = now
        setFrame({ elapsedMs, durationMs, crashX100, crashed: false })
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const { elapsedMs, durationMs, crashX100, crashed } = frame

  const samples = Math.max(2, Math.round((SAMPLES * elapsedMs) / WINDOW_MS) || 2)
  const segments: string[] = []
  let lastX = 0
  let lastY = VIEW_H
  let prevX = 0
  let prevY = VIEW_H

  for (let index = 0; index <= samples; index += 1) {
    prevX = lastX
    prevY = lastY
    const timeMs = durationMs > 0 ? (elapsedMs * index) / samples : 0
    const multiplier = Math.exp(Math.log(crashX100 / 100) * (timeMs / durationMs))
    const x = (timeMs / WINDOW_MS) * VIEW_W
    const y = VIEW_H - Math.min(1, multiplier / AXIS_MAX) * VIEW_H
    segments.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    lastX = x
    lastY = y
  }

  // Tangent at the tip, so the rocket sits on the line instead of floating.
  const angleDeg = Math.min(
    82,
    Math.max(8, (Math.atan2(lastX - prevX, prevY - lastY) * 180) / Math.PI),
  )

  const curve = segments.join(' ')
  const area = `${curve} L ${lastX.toFixed(1)} ${VIEW_H} L 0 ${VIEW_H} Z`

  const liveX100 = Math.round(
    100 * Math.exp(Math.log(crashX100 / 100) * (durationMs > 0 ? elapsedMs / durationMs : 0)),
  )
  const shownX100 = crashed ? crashX100 : liveX100

  return (
    <div className="flex min-h-[440px] flex-col bg-[#0c1116] lg:min-h-[640px]">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-[#0f151b] px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00ff86] shadow-[0_0_10px_rgba(0,255,134,0.9)]" />
          <span className="text-[13px] font-semibold text-white">Network Status</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {history.map((value, index) => {
            const hot = value >= 200
            return (
              <span
                key={`${value}-${index}`}
                className={`flex h-[30px] min-w-[60px] items-center justify-center rounded-full px-3 text-[14px] font-bold tabular-nums ${
                  hot ? 'bg-[#00ff86] text-[#03170d]' : 'bg-[#252f3a] text-[#e6e9ed]'
                }`}
              >
                {formatX(value)}
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
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="dual-demo-area" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={crashed ? '#f63c45' : '#00fa7f'}
                stopOpacity="0.18"
              />
              <stop offset="100%" stopColor={crashed ? '#f63c45' : '#00fa7f'} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[2, 4, 6].map((value) => {
            const y = VIEW_H - (value / AXIS_MAX) * VIEW_H
            return (
              <line
                key={value}
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
          {[1, 2, 3].map((step) => {
            const x = (step / 3) * VIEW_W
            return (
              <line
                key={step}
                x1={x}
                x2={x}
                y1={0}
                y2={VIEW_H}
                stroke="rgba(255,255,255,0.035)"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          <line
            x1={0}
            x2={VIEW_W}
            y1={VIEW_H}
            y2={VIEW_H}
            stroke="rgba(255,255,255,0.1)"
            vectorEffect="non-scaling-stroke"
          />

          <path d={area} fill="url(#dual-demo-area)" />
          <path
            d={curve}
            fill="none"
            stroke={crashed ? '#f63c45' : '#00fa7f'}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              filter: crashed
                ? 'drop-shadow(0 0 6px rgba(246,60,69,0.45))'
                : 'drop-shadow(0 0 6px rgba(0,250,127,0.45))',
            }}
          />
        </svg>

        <ChartRocket
          leftPct={(lastX / VIEW_W) * 100}
          topPct={(lastY / VIEW_H) * 100}
          angleDeg={angleDeg}
          crashed={crashed}
        />

        {/* Y axis */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {[6, 4, 2].map((value) => (
            <div
              key={value}
              className="absolute left-3 flex -translate-y-1/2 items-center gap-2"
              style={{ top: `${(1 - value / AXIS_MAX) * 100}%` }}
            >
              <span className="h-px w-3 bg-white/25" />
              <span className="text-[11px] font-bold text-[#cfd4da]">{value}.0x</span>
            </div>
          ))}
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
          {[10, 20, 30].map((seconds, index) => (
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
          {crashed ? (
            <span className="text-[22px] font-semibold text-white sm:text-[26px]">Crashed</span>
          ) : null}
          <span
            className={`font-bold leading-none tabular-nums tracking-tight ${
              crashed ? 'mt-1 text-[56px] text-[#ff3d47] sm:text-[68px]' : 'text-[46px] text-white'
            }`}
          >
            {formatX(shownX100)}x
          </span>
        </div>
      </div>
    </div>
  )
}
