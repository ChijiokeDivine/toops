import { CalendarIcon, CasinoIcon, ChartUpIcon, CoinIcon } from '@/app/_components/icons'

const STATS = [
  { label: 'Games Played', value: '0', Icon: CasinoIcon },
  { label: 'Total Wagered', value: '$0.00', Icon: CoinIcon },
  { label: 'Wagered Today', value: '$0.00', Icon: CalendarIcon },
  { label: 'Net Profit', value: '$0.00', Icon: ChartUpIcon },
]

export function ProfileStats() {
  return (
    <section className="mt-7">
      <h2 className="text-xl font-bold text-white">Statistics</h2>

      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {STATS.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface)] px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--t-muted)]">
                {label}
              </p>
              <p className="mt-1.5 text-lg font-bold text-white">{value}</p>
            </div>
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--t-bg)] text-[#6aa8e5]"
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
