import Link from 'next/link'
import { MediaSlot } from './media-slot'
import type { Category } from './data'

export function CategoryCard({ title, playing, href, slug, image }: Category) {
  return (
    <Link
      href={href}
      className={`group relative block h-[101px] overflow-hidden rounded-[20px] transition duration-200 hover:brightness-110 lg:h-full ${
        slug === 'multiplayer' ? 'card-multiplayer' : 'card-dual'
      }`}
    >
      <MediaSlot
        src={image}
        alt={title}
        label={`${title} art`}
        fit="contain"
        className="absolute inset-y-3 right-3 w-[46%] transition-transform duration-300 group-hover:scale-105"
      />

      <div className="absolute left-5 top-[15px] flex items-center gap-2 text-[15px] leading-6">
        <span className="relative flex h-3 w-3 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--t-green)]/30" />
          <span className="relative h-2 w-2 rounded-full bg-[var(--t-green)]" />
        </span>
        <span>
          <span className="font-semibold text-white">{playing.toLocaleString('en-US')}</span>{' '}
          <span className="text-[var(--t-muted)]">Playing</span>
        </span>
      </div>

      <h3 className="absolute bottom-5 left-5 text-2xl font-bold leading-6 text-white">{title}</h3>
    </Link>
  )
}
