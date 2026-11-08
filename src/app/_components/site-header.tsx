import Link from 'next/link'
import { AccountNav } from '@/components/account/account-nav'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { getSession } from '@/lib/auth/session'
import { formatPusdUnits } from '@/lib/pusd'
import { getPusdRate, getPusdTokenId } from '@/lib/pusd-server'
import { getMinimumWithdrawalPusd, getWithdrawalFeePusd } from '@/lib/wallet/withdrawals'
import { getPlatformTokenAddress } from '@/lib/wallet/platform-wallet'
import { utcDayKey } from '@/lib/xp'
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

  const name =
    user?.displayName ?? (user?.telegramUsername ? `@${user.telegramUsername}` : 'BCH user')
  const claimAvailable = Boolean(
    user && (!user.xpLastClaimedAt || utcDayKey(user.xpLastClaimedAt) !== utcDayKey(new Date())),
  )
  const rate = user ? await getPusdRate() : null
  const platformAddress = user?.platformWallet?.address ?? null
  let depositTokenAddress: string | null = null
  if (platformAddress) {
    try {
      depositTokenAddress = getPlatformTokenAddress(platformAddress)
    } catch {
      depositTokenAddress = null
    }
  }

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
            <AccountNav
              name={name}
              username={user.telegramUsername}
              imageUrl={user.avatarUrl ?? user.telegramPhotoUrl}
              xp={user.xp}
              claimAvailable={claimAvailable}
              balancePusd={formatPusdUnits(user.balancePusd)}
              platformAddress={platformAddress}
              depositTokenAddress={depositTokenAddress}
              pusdTokenId={getPusdTokenId()}
              network={
                user.platformWallet?.network ??
                (process.env.BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet')
              }
              connectedAddress={user.bchAddress}
              withdrawalFeePusd={rate ? formatPusdUnits(getWithdrawalFeePusd(rate)) : '0.00'}
              minimumWithdrawalPusd={formatPusdUnits(getMinimumWithdrawalPusd())}
            />
          ) : (
            <div className="flex items-center gap-2">
              <AuthTrigger
                view="telegram"
                className="flex h-[43px] cursor-pointer items-center rounded-[10px] bg-[var(--t-surface-2)] px-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--t-surface-3)]"
              >
                Sign in
              </AuthTrigger>
              <AuthTrigger
                view="telegram"
                className="flex h-[43px] cursor-pointer items-center rounded-[10px] bg-[var(--t-green)] px-3.5 text-base font-semibold text-[var(--t-green-ink)] shadow-[0_0_24px_rgba(0,250,127,0.28)] transition hover:brightness-110 active:scale-[0.98]"
              >
                Sign up
              </AuthTrigger>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
