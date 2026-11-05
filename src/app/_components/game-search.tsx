import { SearchIcon } from './icons'

export function GameSearch({ count }: { count: number }) {
  return (
    <label className="flex h-[43px] cursor-text items-center gap-2.5 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface)] px-4 text-[var(--t-muted)] transition-colors focus-within:border-white/15">
      <SearchIcon className="h-6 w-6 shrink-0" />
      <span className="sr-only">Search games</span>
      <input
        type="text"
        name="q"
        autoComplete="off"
        placeholder={`Search ${count} games`}
        className="h-full w-full bg-transparent text-base font-medium text-white outline-none placeholder:text-[var(--t-muted)]"
      />
    </label>
  )
}
