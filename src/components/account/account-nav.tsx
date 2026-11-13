'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BellIcon,
  ChevronDownIcon,
  LogoutIcon,
  SettingsIcon,
  TicketIcon,
  TransactionsIcon,
  UserIcon,
  WalletIcon,
  XpIcon,
} from '@/app/_components/icons'
import { openSettings } from '@/components/settings/settings-events'
import { WalletDialog } from './wallet-dialog'

type AccountNavProps = {
  name: string
  username: string | null
  imageUrl: string | null
  xp: number
  claimAvailable: boolean
  balancePusd: string
  platformAddress: string | null
  depositTokenAddress: string | null
  network: string
  connectedAddress: string | null
  withdrawalFeePusd: string
  minimumWithdrawalPusd: string
}

type MenuName = 'profile' | 'notifications' | null

const XP_PER_LEVEL = 500

/** Menu entries that are intentionally placeholders for now. */
const SOON_ITEMS = [
  { label: 'Transactions', Icon: TransactionsIcon },
  { label: 'My bets', Icon: TicketIcon },
]

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

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 14)}…${address.slice(-8)}` : address
}

const iconButton =
  'relative grid h-[43px] w-[43px] cursor-pointer place-items-center rounded-[10px] bg-[var(--t-surface-2)] text-white transition hover:bg-[var(--t-surface-3)]'

export function AccountNav({
  name,
  username,
  imageUrl,
  xp,
  claimAvailable,
  balancePusd,
  platformAddress,
  depositTokenAddress,
  network,
  connectedAddress,
  withdrawalFeePusd,
  minimumWithdrawalPusd,
}: AccountNavProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<MenuName>(null)
  const [walletOpen, setWalletOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const identity = username
    ? `@${username}`
    : connectedAddress
      ? shortenAddress(connectedAddress)
      : 'Signed in'

  const closeWallet = useCallback(() => setWalletOpen(false), [])

  useEffect(() => {
    if (!menu) return

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menu])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      setMenu(null)
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <Link
        href="/xp"
        aria-label={`XP — level ${level}, ${xp} XP`}
        title={`${xp.toLocaleString()} XP · Level ${level}`}
        className="relative flex h-[43px] cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--t-surface-2)] px-2.5 text-white transition hover:bg-[var(--t-surface-3)]"
      >
        <XpIcon className="h-[21px] w-[21px] text-[#ffd21a]" />
        <span className="hidden text-sm font-semibold tabular-nums sm:block">
          {xp.toLocaleString()}
        </span>
        {claimAvailable && (
          <span
            aria-hidden
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--t-green)] shadow-[0_0_8px_rgba(0,250,127,0.9)]"
          />
        )}
      </Link>

      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          aria-haspopup="dialog"
          aria-expanded={menu === 'notifications'}
          onClick={() => setMenu(menu === 'notifications' ? null : 'notifications')}
          className={iconButton}
        >
          <BellIcon className="h-[21px] w-[21px]" />
        </button>

        {menu === 'notifications' && (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] shadow-[0_18px_60px_rgba(0,0,0,0.6)]"
          >
            <div className="border-b border-[var(--t-border)] px-4 py-3">
              <p className="text-sm font-semibold text-white">Notifications</p>
            </div>
            <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--t-surface-2)] text-[var(--t-muted)]">
                <BellIcon className="h-5 w-5" />
              </span>
              <p className="text-sm text-[var(--t-muted)]">You&apos;re all caught up.</p>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={menu === 'profile'}
          onClick={() => setMenu(menu === 'profile' ? null : 'profile')}
          className="flex h-[43px] cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--t-surface-2)] pl-1 pr-2 text-white transition hover:bg-[var(--t-surface-3)]"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-[33px] w-[33px] rounded-full object-cover" />
          ) : (
            <span className="grid h-[33px] w-[33px] place-items-center rounded-full bg-[var(--t-surface-3)] text-xs font-bold text-white">
              {initials(name)}
            </span>
          )}
          <ChevronDownIcon className="h-4 w-4 text-[var(--t-muted)]" />
        </button>

        {menu === 'profile' && (
          <div
            role="menu"
            aria-label="Account"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] shadow-[0_18px_60px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--t-border)] px-4 py-3.5">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--t-surface-2)] text-sm font-bold text-white">
                  {initials(name)}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{name}</p>
                <p className="truncate text-xs text-[var(--t-muted)]">{identity}</p>
              </div>
            </div>

            <div className="border-b border-[var(--t-border)] px-4 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#ffd21a]">
                  <XpIcon className="h-3.5 w-3.5" />
                  {xp.toLocaleString()} XP
                </span>
                <span className="text-[var(--t-muted)]">Level {level}</span>
              </div>
            </div>

            <div className="p-1.5">
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenu(null)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-white transition hover:bg-[var(--t-surface-2)]"
              >
                <UserIcon className="h-[18px] w-[18px] text-[var(--t-muted)]" />
                Profile
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  setWalletOpen(true)
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-white transition hover:bg-[var(--t-surface-2)]"
              >
                <WalletIcon className="h-[18px] w-[18px] text-[var(--t-muted)]" />
                Wallet
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  openSettings()
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-white transition hover:bg-[var(--t-surface-2)]"
              >
                <SettingsIcon className="h-[18px] w-[18px] text-[var(--t-muted)]" />
                Settings
              </button>

              {SOON_ITEMS.map(({ label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  disabled
                  title="Coming soon"
                  className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--t-muted)] opacity-60"
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                  <span className="ml-auto rounded bg-[var(--t-surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Soon
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-[var(--t-border)] p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogoutIcon className="h-[18px] w-[18px]" />
                {signingOut ? 'Signing out…' : 'Logout'}
              </button>
            </div>
          </div>
        )}
      </div>

      <WalletDialog
        open={walletOpen}
        onClose={closeWallet}
        name={name}
        identity={identity}
        imageUrl={imageUrl}
        network={network}
        balancePusd={balancePusd}
        platformAddress={platformAddress}
        depositTokenAddress={depositTokenAddress}
        connectedAddress={connectedAddress}
        withdrawalFeePusd={withdrawalFeePusd}
        minimumWithdrawalPusd={minimumWithdrawalPusd}
      />
    </div>
  )
}
