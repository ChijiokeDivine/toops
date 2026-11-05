'use client'

import dynamic from 'next/dynamic'
import { TelegramLogin } from './telegram-login'

const WizardConnectLogin = dynamic(
  () => import('./wizard-connect-login').then((mod) => mod.WizardConnectLogin),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-10 animate-pulse rounded-lg bg-[var(--t-surface-2)]"
        aria-label="Loading wallet"
      />
    ),
  },
)

export function SignInPanel() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      <section
        id="telegram"
        className="scroll-mt-24 rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Telegram</h3>
          <p className="mt-1 text-sm text-[var(--t-muted)]">
            Sign in with your Telegram account. No password needed.
          </p>
        </div>
        <TelegramLogin botUsername={botUsername} />
      </section>

      <section
        id="bch"
        className="scroll-mt-24 rounded-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 lg:p-6"
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">BCH wallet</h3>
          <p className="mt-1 text-sm text-[var(--t-muted)]">
            Pair a WizardConnect wallet and sign a challenge transaction to prove ownership.
          </p>
        </div>
        <WizardConnectLogin mode="sign-in" />
      </section>
    </div>
  )
}
