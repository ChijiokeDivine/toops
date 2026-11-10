'use client'

type ChartRocketProps = {
  /** Tip of the curve, as a percentage of the chart box. */
  leftPct: number
  topPct: number
  /** Rotation in degrees, measured clockwise from "nose up". */
  angleDeg: number
  /** When true the rocket keeps flying along its nose, out of the chart. */
  crashed: boolean
}

/**
 * Rocket pinned to the tip of the crash curve. It sits in an HTML overlay (not
 * the stretched SVG) so the artwork never distorts, and on crash it launches
 * clear of the board instead of blinking away.
 */
export function ChartRocket({ leftPct, topPct, angleDeg, crashed }: ChartRocketProps) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -50%) rotate(${angleDeg.toFixed(1)}deg) translate(0, 14px)`,
      }}
      aria-hidden="true"
    >
      <div className={crashed ? 'dual-rocket-exit' : 'dual-rocket'}>
        <svg viewBox="0 0 40 56" className="block h-14 w-10">
          <path
            d="M20 2C30 12 30 25 20 38C10 25 10 12 20 2Z"
            fill="#f8fbff"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="0.8"
          />
          <path d="M13 29L5 40L15 36Z" fill="#ff8a00" />
          <path d="M27 29L35 40L25 36Z" fill="#ff8a00" />
          <circle cx="20" cy="17" r="4.6" fill="#0b1220" stroke="#8fe9ff" strokeWidth="1.2" />
          <path
            d="M20 37L16 50L20 46.5L24 50Z"
            fill="#ffdf1a"
            className="dual-rocket-flame"
          />
        </svg>
      </div>
    </div>
  )
}
