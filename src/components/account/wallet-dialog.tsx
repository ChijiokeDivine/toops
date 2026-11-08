'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AccountWalletPanel } from '@/components/auth/account-wallet-panel'
import { openAuth } from '@/components/auth/auth-events'
import { SignOutButton } from '@/components/auth/sign-out-button'

type WalletDialogProps = {
  open: boolean
  onClose: () => void
  name: string
  identity: string
  imageUrl: string | null
  network: string
  balancePusd: string
  platformAddress: string | null
  depositTokenAddress: string | null
  pusdTokenId: string
  connectedAddress: string | null
  withdrawalFeePusd: string
  minimumWithdrawalPusd: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

export function WalletDialog({
  open,
  onClose,
  name,
  identity,
  imageUrl,
  network,
  balancePusd,
  platformAddress,
  depositTokenAddress,
  pusdTokenId,
  connectedAddress,
  withdrawalFeePusd,
  minimumWithdrawalPusd,
}: WalletDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

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
        onClose()
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
  }, [open, onClose])

  const handleLinkWallet = useCallback(() => {
    onClose()
    openAuth({ view: 'wallet', mode: 'link' })
  }, [onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:max-w-md sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="wallet-dialog-title" className="text-lg font-semibold text-white">
              Wallet
            </h2>
            <span className="rounded-full border border-[var(--t-green)]/30 bg-[var(--t-green)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--t-green)]">
              {network}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--t-muted)] transition hover:bg-[var(--t-surface-2)] hover:text-white"
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

        <div className="mt-4 flex items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
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

        <div className="mt-4">
          {platformAddress ? (
            <AccountWalletPanel
              balancePusd={balancePusd}
              platformAddress={platformAddress}
              depositTokenAddress={depositTokenAddress}
              pusdTokenId={pusdTokenId}
              connectedAddress={connectedAddress}
              withdrawalFeePusd={withdrawalFeePusd}
              minimumWithdrawalPusd={minimumWithdrawalPusd}
              onLinkWallet={handleLinkWallet}
            />
          ) : (
            <p className="rounded-xl border border-[#ffdf1a]/25 bg-[#ffd60a]/10 p-3 text-xs text-[var(--t-gold)]">
              Platform wallet unavailable. Add <code>PLATFORM_WALLET_XPRIV</code> or{' '}
              <code>PLATFORM_WALLET_XPUB</code>.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-[var(--t-border)] pt-3">
          <SignOutButton />
        </div>
      </div>
    </div>,
    document.body,
  )
}
