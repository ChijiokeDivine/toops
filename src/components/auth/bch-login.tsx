'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BCHConnectProvider, createConfig, useSignMessage, useWallet } from 'bch-connect'

type Challenge = {
  address: string
  nonce: string
  message: string
}

function shortenAddress(address: string): string {
  return address.length > 24 ? `${address.slice(0, 12)}…${address.slice(-8)}` : address
}

function WalletPanel() {
  const router = useRouter()
  const { address, isConnected, connect, disconnect, connectError, areAddressesLoading } =
    useWallet()
  const { signMessage } = useSignMessage()

  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    if (!address) return

    setPending(true)
    setError(null)
    setStatus('Requesting a challenge…')

    try {
      const challengeResponse = await fetch('/api/auth/bch/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const challenge = (await challengeResponse.json()) as Challenge & { error?: string }

      if (!challengeResponse.ok || !challenge.message) {
        throw new Error(challenge.error ?? 'Could not create a sign-in challenge.')
      }

      setStatus('Confirm the signature in your wallet…')
      const signature = await signMessage({
        message: challenge.message,
        userPrompt: 'Sign in to toops',
      })

      if (!signature) {
        throw new Error('The wallet did not return a signature.')
      }

      setStatus('Verifying signature…')
      const verifyResponse = await fetch('/api/auth/bch/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          nonce: challenge.nonce,
          message: challenge.message,
          signature,
        }),
      })

      if (!verifyResponse.ok) {
        const data = (await verifyResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Signature verification failed.')
      }

      setStatus('Signed in')
      router.refresh()
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : 'BCH wallet sign-in failed.')
    } finally {
      setPending(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void connect()}
          disabled={areAddressesLoading}
          className="w-full rounded-lg bg-[var(--t-green)] px-4 py-2.5 text-sm font-semibold text-[var(--t-green-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {areAddressesLoading ? 'Connecting…' : 'Connect BCH wallet'}
        </button>
        {connectError && <p className="text-sm text-red-400">{connectError.message}</p>}
        <p className="text-xs text-[var(--t-muted)]">
          Works with WalletConnect-enabled BCH wallets such as Cashonize or Paytaca.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] p-3">
        <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Connected address</p>
        <p className="mt-1 font-mono text-sm text-white" title={address ?? undefined}>
          {address ? shortenAddress(address) : 'Loading address…'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={pending || !address}
        className="w-full rounded-lg bg-[var(--t-green)] px-4 py-2.5 text-sm font-semibold text-[var(--t-green-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Waiting for wallet…' : 'Sign message to sign in'}
      </button>

      <button
        type="button"
        onClick={() => void disconnect()}
        className="w-full text-xs text-[var(--t-muted)] underline-offset-2 hover:text-white hover:underline"
      >
        Disconnect wallet
      </button>

      {status && <p className="text-sm text-[var(--t-muted)]">{status}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function ConfiguredWalletLogin({ projectId }: { projectId: string }) {
  const config = useMemo(() => {
    const origin = window.location.origin
    return createConfig({
      projectId,
      network: process.env.NEXT_PUBLIC_WC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
      metadata: {
        name: 'toops',
        description: 'Bitcoin Cash app for BCH BLAZE 2026',
        url: origin,
        icons: [`${origin}/icon.svg`],
      },
    })
  }, [projectId])

  return (
    <BCHConnectProvider config={config}>
      <WalletPanel />
    </BCHConnectProvider>
  )
}

export default function BchLogin({ projectId }: { projectId: string }) {
  return <ConfiguredWalletLogin projectId={projectId} />
}
