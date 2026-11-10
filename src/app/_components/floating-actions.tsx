import { ChatIcon, SearchIcon } from './icons'

const ACTIONS = [
  { label: 'Open chat', Icon: ChatIcon },
  { label: 'Search', Icon: SearchIcon },

]

/** Desktop-only floating buttons, bottom right. */
export function FloatingActions() {
  return (
    <div className="fixed bottom-4 right-4 z-40 hidden flex-col gap-1.5 lg:flex">
      {ACTIONS.map(({ label, Icon }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/5 bg-[#121a28] text-white shadow-lg shadow-black/40 transition-colors [--icon-cut:#121a28] hover:bg-[#19233a] hover:[--icon-cut:#19233a]"
        >
          <Icon className="h-[22px] w-[22px]" />
        </button>
      ))}
    </div>
  )
}
