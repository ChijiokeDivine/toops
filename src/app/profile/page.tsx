import type { Metadata } from 'next'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { ProfileFavorites } from '@/components/profile/profile-favorites'
import { ProfileForm } from '@/components/profile/profile-form'
import { ProfileSidebar } from '@/components/profile/profile-sidebar'
import { ProfileStats } from '@/components/profile/profile-stats'
import { getSession } from '@/lib/auth/session'
import { UserIcon } from '../_components/icons'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Profile · toops',
  description: 'Manage your toops avatar, username, email, and account statistics.',
}

const XP_PER_LEVEL = 500

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 14)}…${address.slice(-8)}` : address
}

function SignedOut() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--t-surface-2)] text-white">
        <UserIcon className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-white">Sign in to view your profile</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--t-muted)]">
        Manage your avatar, username, and email, and keep track of your toops statistics.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <AuthTrigger
          view="telegram"
          className="cursor-pointer rounded-lg bg-[var(--t-green)] px-4 py-2.5 text-sm font-semibold text-[var(--t-green-ink)] shadow-[0_0_24px_rgba(0,250,127,0.24)] transition hover:brightness-110 active:scale-[0.98]"
        >
          Continue with Telegram
        </AuthTrigger>
        <AuthTrigger
          view="wallet"
          className="cursor-pointer rounded-lg border border-[var(--t-border)] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[var(--t-green)]"
        >
          Connect wallet
        </AuthTrigger>
      </div>
    </div>
  )
}

export default async function ProfilePage() {
  const session = await getSession()

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-3 pb-24 pt-6 lg:px-4 lg:pb-12">
        <SignedOut />
      </main>
    )
  }

  const user = session.user
  const name =
    user.displayName?.trim() ||
    (user.telegramUsername ? `@${user.telegramUsername}` : null) ||
    (user.bchAddress ? shortenAddress(user.bchAddress) : 'BCH user')
  const avatarUrl = user.avatarUrl ?? user.telegramPhotoUrl
  const level = Math.floor(user.xp / XP_PER_LEVEL) + 1

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 pb-24 pt-6 lg:px-4 lg:pb-12">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <ProfileSidebar name={name} imageUrl={avatarUrl} xp={user.xp} level={level} />

        <div className="min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Profile</h1>
            <p className="mt-1 text-sm text-[var(--t-muted)]">
              Manage how you appear across toops.
            </p>
          </div>

          <div className="mt-5">
            <ProfileForm
              initialUsername={user.displayName}
              initialEmail={user.email}
              initialAvatarUrl={avatarUrl}
            />
          </div>

          <ProfileStats />
          <ProfileFavorites />
        </div>
      </div>
    </main>
  )
}
