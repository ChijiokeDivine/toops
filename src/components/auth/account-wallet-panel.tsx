'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CopyButton } from './copy-button'
import { WizardConnectLogin } from './wizard-connect-login'

type AccountWalletPanelProps = {
  balanceSats: string
  platformAddress: string
  network: string
  connectedAddress: string | null
  withdrawalFeeSats: string
}

function formatBch(sats: bigint): string {
  const whole = sats / 100_000_000n
  const fraction = (sats % 100_000_000n).toString().padStart(8, '0')
  return `${whole}.${fraction}`
}

function shortenAddress(address: string): string {
  return address.length > 30 ? `${address.slice(0, 16)}…${address.slice(-10)}` : address
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? fallback
}

export function AccountWalletPanel({
  balanceSats,
  platformAddress,
  network,
  connectedAddress,
  withdrawalFeeSats,
}: AccountWalletPanelProps) {
  const router = useRouter()
  const balance = BigInt(balanceSats)

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null)

  const [showLink, setShowLink] = useState(false)

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
          ? `Credited ${data.newDeposits} deposit(s) worth ${data.creditedSats} sats.`
          : 'No new confirmed deposits found.',
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
      setWithdrawMessage(
        `Sent ${data.amountSats} sats (fee ${data.feeSats} sats). Transaction ${shortenAddress(data.txid)}.`,
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
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Balance</p>
            <p className="mt-1 text-3xl font-semibold text-white">{formatBch(balance)} BCH</p>
            <p className="text-sm text-[var(--t-muted)]">{balance.toString()} sats</p>
          </div>
          <span className="rounded-full border border-[var(--t-green)]/30 bg-[var(--t-green)]/10 px-3 py-1 text-xs font-medium text-[var(--t-green)]">
            {network}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Deposit address</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-[var(--t-surface-2)] px-3 py-2 font-mono text-sm text-[var(--t-green)]">
              {platformAddress}
            </code>
            <CopyButton value={platformAddress} label="Copy address" />
          </div>
          <p className="mt-2 text-xs text-[var(--t-muted)]">
            Send BCH on {network} to this address. Deposit detection is server-side; press sync
            after your transaction confirms.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg border border-[var(--t-border)] px-3 py-2 text-sm text-white transition hover:border-[var(--t-green)] disabled:opacity-50"
          >
            {syncing ? 'Scanning…' : 'Sync deposits'}
          </button>
          {syncMessage && <p className="text-sm text-[var(--t-green)]">{syncMessage}</p>}
        </div>

        <p className="mt-4 text-xs text-[var(--t-muted)]">
          The platform wallet is custodial: your game balance lives off-chain and only the public
          receiving address is stored. The master key is kept outside the database.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Payout wallet</p>
            {connectedAddress ? (
              <p className="mt-1 font-mono text-sm text-white">
                {shortenAddress(connectedAddress)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--t-muted)]">
                Connect a WizardConnect wallet to receive withdrawals.
              </p>
            )}
          </div>
          {connectedAddress && (
            <button
              type="button"
              onClick={() => setShowLink((value) => !value)}
              className="rounded-lg border border-[var(--t-border)] px-3 py-2 text-sm text-white transition hover:border-[var(--t-green)]"
            >
              {showLink ? 'Cancel' : 'Change wallet'}
            </button>
          )}
        </div>

        {(!connectedAddress || showLink) && (
          <div className="mt-4">
            <WizardConnectLogin
              mode="link"
              onSuccess={() => {
                setShowLink(false)
                router.refresh()
              }}
            />
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--t-muted)]">
          Withdrawals can only be sent to this verified wallet address.
        </p>
      </div>

      <form
        onSubmit={handleWithdraw}
        className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 p-5"
      >
        <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Withdraw</p>
        <p className="mt-1 text-sm text-[var(--t-muted)]">
          Withdraw off-chain balance to your payout wallet. Network fee:{' '}
          <span className="text-white">{withdrawalFeeSats} sats</span>.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-[var(--t-muted)]">Amount (sats)</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="100000"
              className="w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[var(--t-green)]"
            />
          </label>
          <button
            type="submit"
            disabled={withdrawing || !connectedAddress || !amount.trim()}
            className="rounded-lg bg-[var(--t-green)] px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {withdrawing ? 'Sending…' : 'Withdraw'}
          </button>
        </div>

        {!connectedAddress && (
          <p className="mt-2 text-xs text-[var(--t-gold)]">
            Connect a payout wallet before withdrawing.
          </p>
        )}
        {withdrawMessage && <p className="mt-2 text-sm text-[var(--t-green)]">{withdrawMessage}</p>}
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
