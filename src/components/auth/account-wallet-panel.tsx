'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CopyButton } from './copy-button'

type AccountWalletPanelProps = {
  balanceSats: string
  platformAddress: string
  connectedAddress: string | null
  withdrawalFeeSats: string
  /** Close the popup and open the auth popup in wallet-linking mode. */
  onLinkWallet: () => void
}

type WalletTab = 'wallet' | 'withdraw'

function formatBch(sats: bigint): string {
  const whole = sats / 100_000_000n
  const fraction = (sats % 100_000_000n).toString().padStart(8, '0')
  return `${whole}.${fraction}`
}

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 14)}…${address.slice(-8)}` : address
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? fallback
}

const card = 'rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-4'
const label = 'text-[11px] uppercase tracking-wide text-[var(--t-muted)]'

export function AccountWalletPanel({
  balanceSats,
  platformAddress,
  connectedAddress,
  withdrawalFeeSats,
  onLinkWallet,
}: AccountWalletPanelProps) {
  const router = useRouter()
  const balance = BigInt(balanceSats)

  const [tab, setTab] = useState<WalletTab>('wallet')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
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
        creditedSats: string
        balanceSats: string
      }
      setSyncMessage(
        data.newDeposits > 0
          ? `Credited ${data.newDeposits} deposit(s).`
          : 'No new deposits found.',
      )
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
        body: JSON.stringify({ amountSats: amount.trim() }),
      })
      if (!response.ok) {
        throw new Error(await readError(response, 'Withdrawal failed.'))
      }

      const data = (await response.json()) as { txid: string; amountSats: string; feeSats: string }
      setWithdrawMessage(`Sent ${data.amountSats} sats · ${shortenAddress(data.txid)}`)
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
              {formatBch(balance)}{' '}
              <span className="text-sm font-medium text-[var(--t-muted)]">BCH</span>
            </p>
            <p className="text-xs text-[var(--t-muted)]">{balance.toString()} sats</p>
          </div>

          <div className={card}>
            <p className={label}>Deposit address</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-[var(--t-surface-2)] px-2.5 py-2 font-mono text-xs text-[var(--t-green)]">
                {platformAddress}
              </code>
              <CopyButton value={platformAddress} label="Copy" />
            </div>
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
              <span className={label}>Amount (sats)</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="100000"
                className="mt-1.5 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[var(--t-green)]"
              />
            </label>
            <button
              type="submit"
              disabled={withdrawing || !connectedAddress || !amount.trim()}
              className="mt-3 w-full rounded-lg bg-[var(--t-green)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? 'Sending…' : 'Withdraw'}
            </button>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Network fee: {withdrawalFeeSats} sats
            </p>
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
