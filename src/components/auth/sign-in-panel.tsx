'use client'

import dynamic from 'next/dynamic'
import { TelegramLogin } from './telegram-login'

const BchLogin = dynamic(() => import('./bch-login'), {
  ssr: false,
  loading: () => (
    <div
      className="h-10 animate-pulse rounded-lg bg-[var(--t-surface-2)]"
      aria-label="Loading wallet"
    />
  ),
})

export function SignInPanel() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID

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
            Connect a wallet and sign a message to prove ownership.
          </p>
        </div>
        {wcProjectId ? (
          <BchLogin projectId={wcProjectId} />
        ) : (
          <p className="rounded-lg border border-[#ffdf1a]/25 bg-[#ffd60a]/10 p-3 text-sm text-[var(--t-gold)]">
            Wallet sign-in needs <code className="text-white">NEXT_PUBLIC_WC_PROJECT_ID</code> from
            the{' '}
            <a
              className="underline underline-offset-2"
              href="https://dashboard.reown.com"
              target="_blank"
              rel="noreferrer"
            >
              Reown dashboard
            </a>
            .
          </p>
        )}
      </section>
    </div>
  )
}
