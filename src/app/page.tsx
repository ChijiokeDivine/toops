import { CategoryCard } from './_components/category-card'
import { CATEGORIES, GAME_COUNT, ORIGINALS } from './_components/data'
import { GameSearch } from './_components/game-search'
import { Hero } from './_components/hero'
import { OriginalsRow } from './_components/originals-row'
import { AccountWalletPanel } from '@/components/auth/account-wallet-panel'
import { SignInPanel } from '@/components/auth/sign-in-panel'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 16)}…${address.slice(-10)}` : address
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default async function Home() {
  const session = await getSession()
  const user = session?.user
  const wallet = user?.platformWallet

  const name =
    user?.displayName ??
    (user?.telegramUsername ? `@${user.telegramUsername}` : undefined) ??
    'BCH user'

  const identity = user?.telegramUsername
    ? `@${user.telegramUsername}`
    : user?.bchAddress
      ? shortenAddress(user.bchAddress)
      : 'Signed in'

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-10">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Hero />
        </div>

        {CATEGORIES.map((category) => (
          <CategoryCard key={category.slug} {...category} />
        ))}
      </div>

      <div className="mt-4 lg:max-w-md">
        <GameSearch count={GAME_COUNT} />
      </div>

      <div className="mt-7 space-y-7">
        <OriginalsRow games={ORIGINALS} />
      </div>

      <section id="sign-in" className="mt-7 scroll-mt-24">
        {user ? (
          <div className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {user.telegramPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.telegramPhotoUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--t-surface-2)] text-lg font-semibold text-white">
                    {initials(name) || 'T'}
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Signed in</p>
                  <h2 className="text-xl font-semibold text-white">{name}</h2>
                  <p className="text-sm text-[var(--t-muted)]">{identity}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[var(--t-green)]/30 bg-[var(--t-green)]/10 px-3 py-1 text-xs font-medium text-[var(--t-green)]">
                  {wallet?.network ??
                    (process.env.BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet')}
                </span>
                <SignOutButton />
              </div>
            </div>

            {wallet ? (
              <AccountWalletPanel
                balanceSats={user.balanceSats.toString()}
                platformAddress={wallet.address}
                network={wallet.network}
                connectedAddress={user.bchAddress}
                withdrawalFeeSats={process.env.WITHDRAWAL_FEE_SATS ?? '1000'}
              />
            ) : (
              <p className="mt-5 rounded-lg border border-[#ffdf1a]/25 bg-[#ffd60a]/10 p-3 text-sm text-[var(--t-gold)]">
                Your platform wallet is not available. Add <code>PLATFORM_WALLET_XPRIV</code> or{' '}
                <code>PLATFORM_WALLET_XPUB</code> to this deployment and sign in again.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6">
            <div className="mb-5 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Sign in to play</h2>
              <p className="mt-2 text-sm text-[var(--t-muted)]">
                Use Telegram or a Bitcoin Cash wallet. A platform wallet is created for you
                automatically on your first sign-in.
              </p>
            </div>
            <SignInPanel />
          </div>
        )}
      </section>

      <p className="mt-7 text-xs text-[var(--t-muted)]">
        Running on chipnet. BCH transactions are test funds only until mainnet launch.
      </p>
    </main>
  )
}
