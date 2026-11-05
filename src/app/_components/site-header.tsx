import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { getSession } from '@/lib/auth/session'
import { KingOfTheHill } from './king-of-the-hill'
import { Logo } from './logo'

const NAV = [
  { label: 'Originals', href: '/originals' },
  { label: 'Multiplayer', href: '/multiplayer' },
  { label: 'Dual', href: '/dual' },
  { label: 'Rewards', href: '/rewards' },
  { label: 'Affiliates', href: '/affiliates' },
]

export async function SiteHeader() {
  const session = await getSession()
  const user = session?.user

  const label = user?.telegramUsername
    ? `@${user.telegramUsername}`
    : (user?.displayName ?? 'My account')

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--t-border)] bg-[rgba(8,13,23,0.92)] backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center px-3 lg:px-4">
        <Logo />

        <nav aria-label="Primary" className="ml-10 hidden items-center gap-9 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-base font-medium text-[var(--t-muted)] transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center">
          <KingOfTheHill />
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/#sign-in"
                className="flex h-[43px] max-w-[160px] items-center truncate rounded-[10px] bg-[var(--t-surface-2)] px-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--t-surface-3)]"
              >
                {label}
              </Link>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/#sign-in"
                className="flex h-[43px] items-center rounded-[10px] bg-[var(--t-surface-2)] px-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--t-surface-3)]"
              >
                Sign in
              </Link>
              <Link
                href="/#sign-in"
                className="flex h-[43px] items-center rounded-[10px] bg-[var(--t-green)] px-3.5 text-base font-semibold text-[var(--t-green-ink)] shadow-[0_0_24px_rgba(0,250,127,0.28)] transition hover:brightness-110 active:scale-[0.98]"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
