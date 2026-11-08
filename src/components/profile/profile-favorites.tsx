import Link from 'next/link'
import { StarIcon } from '@/app/_components/icons'

export function ProfileFavorites() {
  return (
    <section className="mt-7 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-4 lg:p-5">
      <div className="flex items-center gap-2">
        <StarIcon className="h-4 w-4 text-[#ffd21a]" />
        <h2 className="text-lg font-semibold text-white">Your Favorites</h2>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--t-border)] px-4 py-8 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffd21a]/10 text-[#ffd21a]">
          <StarIcon className="h-5 w-5" />
        </span>
        <p className="text-sm text-[var(--t-muted)]">You haven&apos;t favorited any games yet.</p>
        <Link
          href="/"
          className="mt-1 text-sm font-semibold text-[var(--t-green)] transition hover:brightness-110"
        >
          Browse games 
        </Link>
      </div>
    </section>
  )
}
