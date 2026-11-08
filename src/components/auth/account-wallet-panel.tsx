'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PayoutAsset } from '@/lib/pusd'
import { CopyButton } from './copy-button'

type AccountWalletPanelProps = {
  balancePusd: string
  platformAddress: string
  depositTokenAddress: string | null
  pusdTokenId: string
  connectedAddress: string | null
  withdrawalFeePusd: string
  minimumWithdrawalPusd: string
  /** Close the popup and open the auth popup in wallet-linking mode. */
  onLinkWallet: () => void
}

type WalletTab = 'wallet' | 'withdraw'

const PARYON_APP_URL = 'https://paryonusd.com/app'

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 14)}…${address.slice(-8)}` : address
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? fallback
}

const card = 'rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-4'
const label = 'text-[11px] uppercase tracking-wide text-[var(--t-muted)]'

const payoutOptions: Array<{ value: PayoutAsset; label: string; hint: string }> = [
  { value: 'PUSD', label: 'PUSD', hint: 'Receive PUSD tokens' },
  { value: 'BCH', label: 'BCH', hint: 'Swap to BCH at payout' },
]

export function AccountWalletPanel({
  balancePusd,
  platformAddress,
  depositTokenAddress,
  pusdTokenId,
  connectedAddress,
  withdrawalFeePusd,
  minimumWithdrawalPusd,
  onLinkWallet,
}: AccountWalletPanelProps) {
  const router = useRouter()
  const depositAddress = depositTokenAddress ?? platformAddress

  const [tab, setTab] = useState<WalletTab>('wallet')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [payoutAsset, setPayoutAsset] = useState<PayoutAsset>('PUSD')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    setSyncMessage(null)

    try {
      const response = await fetch('/api/wallet/sync', { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readError(response, 'Unable to scan for deposits.'))
      }

      const data = (await response.json()) as {
        newDeposits: number
        creditedPusd: string
        swappedDeposits: number
      }
      if (data.newDeposits > 0) {
        const swapped =
          data.swappedDeposits > 0 ? ` (${data.swappedDeposits} swapped BCH → PUSD)` : ''
        setSyncMessage(`Credited ${data.creditedPusd} PUSD${swapped}.`)
      } else {
        setSyncMessage('No new deposits found.')
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to scan for deposits.')
    } finally {
      setSyncing(false)
    }
  }

  const handleWithdraw = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWithdrawing(true)
    setError(null)
    setWithdrawMessage(null)

    try {
      const response = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPusd: amount.trim().replace(',', '.'),
          payoutAsset,
        }),
      })
      if (!response.ok) {
        throw new Error(await readError(response, 'Withdrawal failed.'))
      }

      const data = (await response.json()) as {
        txid: string
        payoutAsset: PayoutAsset
        amountPusd: string
      }
      setWithdrawMessage(
        `Sent ${data.amountPusd} PUSD as ${data.payoutAsset} · ${shortenAddress(data.txid)}`,
      )
      setAmount('')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Withdrawal failed.')
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Wallet"
        className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'wallet'}
          onClick={() => setTab('wallet')}
          className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${
            tab === 'wallet'
              ? 'bg-[var(--t-surface-2)] text-white'
              : 'text-[var(--t-muted)] hover:text-white'
          }`}
        >
          Wallet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'withdraw'}
          onClick={() => setTab('withdraw')}
          className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${
            tab === 'withdraw'
              ? 'bg-[var(--t-surface-2)] text-white'
              : 'text-[var(--t-muted)] hover:text-white'
          }`}
        >
          Withdraw
        </button>
      </div>

      {tab === 'wallet' ? (
        <div role="tabpanel" className="mt-3 space-y-2.5">
          <div className={card}>
            <p className={label}>Balance</p>
            <p className="mt-1 text-3xl font-semibold text-white">
              {balancePusd} <span className="text-sm font-medium text-[var(--t-muted)]">PUSD</span>
            </p>
            <p className="text-xs text-[var(--t-muted)]">
              ParyonUSD stablecoin, redeemable for BCH.
            </p>
          </div>

          <div className={card}>
            <p className={label}>Deposit address</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-[var(--t-surface-2)] px-2.5 py-2 font-mono text-xs text-[var(--t-green)]">
                {depositAddress}
              </code>
              <CopyButton value={depositAddress} label="Copy" />
            </div>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Send <span className="text-white">PUSD</span> or{' '}
              <span className="text-white">BCH</span> to this address. BCH deposits are
              automatically swapped to PUSD. 
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="rounded-lg border border-[var(--t-border)] px-3 py-1.5 text-sm text-white transition hover:border-[var(--t-green)] disabled:opacity-50"
              >
                {syncing ? 'Scanning…' : 'Sync deposits'}
              </button>
              {syncMessage && (
                <p className="text-xs text-[var(--t-green)]" role="status">
                  {syncMessage}
                </p>
              )}
            </div>
           
          </div>
        </div>
      ) : (
        <div role="tabpanel" className="mt-3 space-y-2.5">
          <div className={card}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={label}>Payout wallet</p>
                <p className="mt-1 truncate font-mono text-sm text-white">
                  {connectedAddress ? shortenAddress(connectedAddress) : 'Not linked'}
                </p>
              </div>
              <button
                type="button"
                onClick={onLinkWallet}
                className="shrink-0 cursor-pointer rounded-lg border border-[var(--t-border)] px-3 py-1.5 text-sm text-white transition hover:border-[var(--t-green)]"
              >
                {connectedAddress ? 'Change' : 'Connect'}
              </button>
            </div>
          </div>

          <form onSubmit={handleWithdraw} className={card}>
            <label className="block">
              <span className={label}>Amount (PUSD)</span>
              <div className="mt-1.5 flex items-center rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] pl-3 focus-within:border-[var(--t-green)]">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="10.00"
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm text-white outline-none"
                />
                <span className="pr-3 text-xs text-[var(--t-muted)]">PUSD</span>
              </div>
            </label>

            <fieldset className="mt-3">
              <legend className={label}>Receive as</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] p-1">
                {payoutOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={payoutAsset === option.value}
                    title={option.hint}
                    onClick={() => setPayoutAsset(option.value)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      payoutAsset === option.value
                        ? 'bg-[var(--t-green)] text-black'
                        : 'text-[var(--t-muted)] hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={withdrawing || !connectedAddress || !amount.trim()}
              className="mt-3 w-full rounded-lg bg-[var(--t-green)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? 'Sending…' : `Withdraw in ${payoutAsset}`}
            </button>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Fee: {withdrawalFeePusd} PUSD · Minimum: {minimumWithdrawalPusd} PUSD
            </p>
            {payoutAsset === 'BCH' && (
              <p className="mt-1 text-xs text-[var(--t-muted)]">
                BCH payouts are swapped from PUSD at the current Cauldron rate.
              </p>
            )}
            {!connectedAddress && (
              <p className="mt-1.5 text-xs text-[var(--t-gold)]">Connect a payout wallet first.</p>
            )}
            {withdrawMessage && (
              <p className="mt-2 text-xs text-[var(--t-green)]" role="status">
                {withdrawMessage}
              </p>
            )}
          </form>
        </div>
      )}

      {error && <p className="mt-2.5 text-sm text-red-400">{error}</p>}
    </div>
  )
}
