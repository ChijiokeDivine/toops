import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'
import { CasinoIcon, ChatIcon, GiftIcon, MenuIcon, SearchIcon, SportsIcon } from './icons'

type Item = {
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  href?: string
}

const ITEMS: Item[] = [
  // { label: 'Menu', Icon: MenuIcon },
  { label: 'Search', Icon: SearchIcon },
  { label: 'Multiplayer', Icon: CasinoIcon, href: '/multiplayer' },
  { label: 'Dual', Icon: SportsIcon, href: '/originals/crash' },
  { label: 'Chat', Icon: ChatIcon },
]

const cell =
  'flex h-full flex-col items-center justify-center gap-1 text-[var(--t-muted)] transition-colors hover:text-white active:text-white'

export function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--t-border)] bg-[rgba(8,13,23,0.96)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid h-[60px] grid-cols-6">
        {ITEMS.map(({ label, Icon, href }) => (
          <li key={label}>
            {href ? (
              <Link href={href} className={cell}>
                <Icon className="h-6 w-6" />
                <span className="text-[13px] font-medium leading-none">{label}</span>
              </Link>
            ) : (
              <button type="button" className={`${cell} w-full`}>
                <Icon className="h-6 w-6" />
                <span className="text-[13px] font-medium leading-none">{label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
