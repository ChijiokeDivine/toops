'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTH_EVENT, type AuthMode, type AuthRequest, type AuthView } from './auth-events'
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AuthDialog() {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<AuthView>('telegram')
  const [mode, setMode] = useState<AuthMode>('sign-in')

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const activeView: AuthView = mode === 'link' ? 'wallet' : view

  const openDialog = useCallback((request: AuthRequest = {}) => {
    setMode(request.mode ?? 'sign-in')
    setView(request.view ?? 'telegram')
    setOpen(true)
  }, [])

  const closeDialog = useCallback(() => setOpen(false), [])

  const handleSuccess = useCallback(() => {
    setOpen(false)
    // Never navigate after authentication: stay on the page the user opened the
    // popup from (usually the homepage) and let the session re-render in place.
    router.refresh()
  }, [router])

  useEffect(() => {
    function handleOpen(event: Event) {
      openDialog((event as CustomEvent<AuthRequest>).detail ?? {})
    }

    window.addEventListener(AUTH_EVENT, handleOpen)
    return () => window.removeEventListener(AUTH_EVENT, handleOpen)
  }, [openDialog])

  // Keep the old hash links working (`/#sign-in`, `#telegram`, `#bch`) while
  // always presenting the flow in this popup instead of scrolling inline.
  useEffect(() => {
    function applyHash() {
      const hash = window.location.hash.toLowerCase()
      const request: AuthRequest | null =
        hash === '#telegram' || hash === '#sign-in' || hash === '#signup'
          ? { view: 'telegram' }
          : hash === '#bch' || hash === '#wallet'
            ? { view: 'wallet' }
            : null

      if (!request) return

      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
      openDialog(request)
    }

    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [openDialog])

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.getClientRects().length > 0,
      )

    const focusTimer = window.setTimeout(() => focusable()[0]?.focus(), 0)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  const linking = mode === 'link'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={closeDialog}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:max-w-md sm:rounded-[20px] lg:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-dialog-title" className="text-xl font-semibold text-white">
              {linking ? 'Link payout wallet' : 'Sign in to toops'}
            </h2>
            <p className="mt-1 text-sm text-[var(--t-muted)]">
              {linking
                ? 'Pair the WizardConnect wallet that should receive your withdrawals.'
                : 'Use Telegram or a Bitcoin Cash wallet. Your platform wallet is created automatically.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--t-muted)] transition hover:bg-[var(--t-surface-2)] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {!linking && (
          <div
            role="tablist"
            aria-label="Sign-in method"
            className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'telegram'}
              onClick={() => setView('telegram')}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeView === 'telegram'
                  ? 'bg-[var(--t-surface-2)] text-white'
                  : 'text-[var(--t-muted)] hover:text-white'
              }`}
            >
              Telegram
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'wallet'}
              onClick={() => setView('wallet')}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeView === 'wallet'
                  ? 'bg-[var(--t-surface-2)] text-white'
                  : 'text-[var(--t-muted)] hover:text-white'
              }`}
            >
              BCH wallet
            </button>
          </div>
        )}

        <div className="mt-5" role="tabpanel">
          {activeView === 'telegram' ? (
            <TelegramLogin botUsername={botUsername} onSuccess={handleSuccess} />
          ) : (
            <WizardConnectLogin mode={mode} onSuccess={handleSuccess} />
          )}
        </div>

        <p className="mt-5 border-t border-[var(--t-border)] pt-4 text-xs text-[var(--t-muted)]">
          Your keys never leave your wallet. This window closes when authentication completes.
        </p>
      </div>
    </div>
  )
}
