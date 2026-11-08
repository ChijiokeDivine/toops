'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChatIcon,
  LinkIcon,
  LockIcon,
  LogoutIcon,
  SettingsIcon,
  StarIcon,
  TransactionsIcon,
  UserIcon,
  UsersIcon,
} from '@/app/_components/icons'

type ProfileSidebarProps = {
  name: string
  imageUrl: string | null
  xp: number
  level: number
}

const NAV_ITEMS = [
  { label: 'Profile', Icon: UserIcon, href: '/profile' },
  { label: 'Inbox', Icon: ChatIcon },
  { label: 'Affiliates', Icon: UsersIcon },
  { label: 'Settings', Icon: SettingsIcon },
  { label: 'Privacy', Icon: LockIcon },
  { label: 'Connections', Icon: LinkIcon },
  { label: 'Transactions', Icon: TransactionsIcon },
] as const

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'T'
  )
}

export function ProfileSidebar({ name, imageUrl, xp, level }: ProfileSidebarProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const progress = xp % 500
  const percent = Math.round((progress / 500) * 100)
  const rank = level <= 1 ? 'Unranked' : `Level ${level}`

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <aside className="space-y-3 lg:sticky lg:top-[88px]">
      <div className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-3">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--t-bg)]/70 p-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--t-surface-2)] text-sm font-bold text-white">
              {initials(name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-[var(--t-muted)]">{rank}</p>
          </div>
        </div>

        <div className="px-1 pt-3">
          <div
            role="progressbar"
            aria-label="Level progress"
            aria-valuemin={0}
            aria-valuemax={500}
            aria-valuenow={progress}
            className="h-1.5 overflow-hidden rounded-full bg-black/45"
          >
            <div
              className="h-full rounded-full bg-[var(--t-green)]"
              style={{ width: `${Math.max(percent, 0)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--t-muted)]">
            <span>{percent}%</span>
            <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-surface-2)] px-2 py-0.5 font-medium text-white">
              {rank}
            </span>
          </div>
        </div>
      </div>

      <nav
        aria-label="Profile"
        className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-2"
      >
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ label, Icon, ...item }) => {
            const isActive = 'href' in item
            return (
              <li key={label}>
                {isActive ? (
                  <Link
                    href={item.href}
                    aria-current="page"
                    className="flex items-center gap-3 rounded-lg bg-[var(--t-surface-2)] px-3 py-2.5 text-sm font-semibold text-[var(--t-green)]"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--t-muted)] opacity-70"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide opacity-60">
                      Soon
                    </span>
                  </button>
                )}
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--t-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
              {signingOut ? 'Signing out…' : 'Log out'}
            </button>
          </li>
        </ul>
      </nav>

      <div className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-3">
        <div className="flex items-center gap-2 px-1 text-xs text-[var(--t-muted)]">
          <StarIcon className="h-3.5 w-3.5 text-[#ffd21a]" />
          <span>
            <span className="font-semibold text-white">{xp.toLocaleString()}</span> XP earned
          </span>
        </div>
      </div>
    </aside>
  )
}
