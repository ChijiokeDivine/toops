'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { ArrowIcon, OriginalsBadgeIcon } from './icons'
import { MediaSlot } from './media-slot'
import type { Game } from './data'

function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/originals/${game.slug}`}
      aria-label={game.name}
      style={{ background: game.gradient, containerType: 'inline-size' }}
      className="group relative block aspect-[47/60] w-full overflow-hidden rounded-[14px] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-10px_rgba(0,0,0,0.7)]"
    >
      <MediaSlot
        src={game.image}
        alt={game.name}
        variant="bare"
        label={game.name}
        className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]"
      />

      <span
        className="absolute inset-x-0 bottom-[21%] z-10 whitespace-nowrap text-center font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
        style={{ fontSize: '13cqw' }}
      >
        {game.name}
      </span>

      {/* brand tab */}
      <span className="game-tab absolute bottom-0 left-1/2 flex h-[9%] min-h-[18px] w-[58%] -translate-x-1/2 items-center justify-center bg-white/20 text-[11px] font-semibold leading-none text-white/90 backdrop-blur-[2px]">
        toops
      </span>
    </Link>
  )
}

export function OriginalsRow({ games }: { games: Game[] }) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * (el.clientWidth + 10), behavior: 'smooth' })
  }

  const arrowBtn =
    'flex h-9 w-9 items-center justify-center bg-[var(--t-surface-2)] text-white transition-colors hover:bg-[var(--t-surface-3)] active:bg-[var(--t-surface-3)]'

  return (
    <section aria-labelledby="originals-title">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <OriginalsBadgeIcon className="h-[26px] w-[26px]" />
          <h2
            id="originals-title"
            className="text-2xl font-semibold leading-none tracking-tight text-white"
          >
            toops Originals
          </h2>
        </div>

        <div className="flex items-center gap-0.5">
          <Link
            href="/originals"
            className="mr-0.5 hidden h-9 items-center rounded-[10px] bg-[var(--t-surface-2)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--t-surface-3)] lg:flex"
          >
            View all
          </Link>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => scroll(-1)}
            className={`${arrowBtn} rounded-l-[10px] rounded-r-[3px]`}
          >
            <ArrowIcon direction="left" className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => scroll(1)}
            className={`${arrowBtn} rounded-l-[3px] rounded-r-[10px]`}
          >
            <ArrowIcon direction="right" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar -my-2 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth py-2"
      >
        {games.map((game) => (
          <div
            key={game.slug}
            className="w-[calc((100%_-_20px)/3)] shrink-0 snap-start sm:w-[calc((100%_-_30px)/4)] lg:w-[calc((100%_-_50px)/6)]"
          >
            <GameCard game={game} />
          </div>
        ))}
      </div>
    </section>
  )
}
