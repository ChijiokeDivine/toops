import { CategoryCard } from './_components/category-card'
import { CATEGORIES, GAME_COUNT, ORIGINALS } from './_components/data'
import { GameSearch } from './_components/game-search'
import { Hero } from './_components/hero'
import { OriginalsRow } from './_components/originals-row'
import { CopyButton } from '@/components/auth/copy-button'
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
      <Hero />

      <div className="mt-4 lg:max-w-md">
        <GameSearch count={GAME_COUNT} />
      </div>

      <div className="mt-7 space-y-7">
        <OriginalsRow games={ORIGINALS} />

        <div className="grid gap-2.5 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <CategoryCard key={category.slug} {...category} />
          ))}
        </div>
      </div>

      <section id="sign-in" className="mt-7 scroll-mt-24">
        {user && wallet ? (
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
                  {wallet.network}
                </span>
                <SignOutButton />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">
                    Your platform wallet
                  </p>
                  <p className="mt-1 text-sm text-[var(--t-muted)]">
                    Created automatically when you signed up.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <code className="break-all rounded-lg bg-[var(--t-surface-2)] px-3 py-2 font-mono text-sm text-[var(--t-green)]">
                  {wallet.address}
                </code>
                <CopyButton value={wallet.address} label="Copy address" />
              </div>

              <p className="mt-4 text-xs text-[var(--t-muted)]">
                The wallet key is encrypted server-side and never sent to the browser. This is a
                custodial setup for the hackathon — move to KMS/MPC before holding real funds.
              </p>
            </div>
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
