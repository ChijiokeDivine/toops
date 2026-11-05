'use client'

import {
  deriveHdPublicNodeChild,
  decodeHdPublicKey,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import type { DappConnectionManager } from '@wizardconnect/dapp'
import { useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type ChallengeSourceOutput = {
  outpointIndex: number
  outpointTransactionHash: string
  sequenceNumber: number
  unlockingBytecode: string
  valueSatoshis: string
  lockingBytecode: string
}

type WalletChallengeResponse = {
  address: string
  nonce: string
  message: string
  transaction: string
  sourceOutputs: ChallengeSourceOutput[]
  expiresAt: string
}

type WizardConnectLoginProps = {
  mode: 'sign-in' | 'link'
  onSuccess?: (address: string) => void
}

function walletReceiveAddress(manager: DappConnectionManager): string {
  const node = manager.getXpubNode(0)
  if (!node) {
    throw new Error('The wallet did not share a receive xpub.')
  }

  const receivePath = manager.getSessionPaths().find((path) => path.name === 'receive')

  let prefix: 'bitcoincash' | 'bchtest' = 'bchtest'
  if (receivePath) {
    const decoded = decodeHdPublicKey(receivePath.xpub)
    if (typeof decoded !== 'string' && decoded.network === 'mainnet') {
      prefix = 'bitcoincash'
    }
  }

  const child = deriveHdPublicNodeChild(node, 0)
  if (typeof child === 'string') {
    throw new Error(`Unable to derive the wallet address: ${child}`)
  }

  const encoded = publicKeyToP2pkhCashAddress({ publicKey: child.publicKey, prefix })
  if (typeof encoded === 'string') {
    throw new Error(`Unable to encode the wallet address: ${encoded}`)
  }

  return encoded.address
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error ?? fallback
}

export function WizardConnectLogin({ mode, onSuccess }: WizardConnectLoginProps) {
  const router = useRouter()
  const {
    state,
    manager,
    uri,
    qrUri,
    walletName,
    connect,
    disconnect,
    error: connectionError,
  } = useWizardConnect({ dappName: 'toops', persistSession: false })

  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const requestSignature = useCallback(
    async (connection: DappConnectionManager) => {
      setPending(true)
      setError(null)
      setStatus('Preparing a wallet challenge…')

      try {
        const address = walletReceiveAddress(connection)

        const challengeResponse = await fetch('/api/auth/wallet/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        })
        if (!challengeResponse.ok) {
          throw new Error(
            await readError(challengeResponse, 'Unable to start wallet verification.'),
          )
        }
        const challenge = (await challengeResponse.json()) as WalletChallengeResponse

        setStatus('Waiting for your wallet to sign the challenge…')
        const signRequest = {
          transaction: {
            transaction: challenge.transaction,
            sourceOutputs: challenge.sourceOutputs,
            broadcast: false,
            userPrompt:
              mode === 'link'
                ? 'Link this wallet to your toops account'
                : 'Sign in to toops with this wallet',
          },
          inputPaths: [[0, 'receive', 0]] as [number, string, number][],
        }
        const signed = await connection.signTransaction(
          signRequest as unknown as Parameters<typeof connection.signTransaction>[0],
        )

        if (!signed.signedTransaction) {
          throw new Error(signed.error ?? 'The wallet did not return a signature.')
        }

        setStatus('Verifying the wallet signature…')
        const endpoint = mode === 'link' ? '/api/wallet/link' : '/api/auth/wallet/verify'
        const verifyResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            nonce: challenge.nonce,
            signedTransaction: signed.signedTransaction,
          }),
        })
        if (!verifyResponse.ok) {
          throw new Error(await readError(verifyResponse, 'Wallet verification failed.'))
        }

        setStatus(mode === 'link' ? 'Wallet linked.' : 'Signed in with wallet.')
        onSuccess?.(address)
        router.refresh()
      } catch (cause) {
        setStatus(null)
        setError(cause instanceof Error ? cause.message : 'Wallet verification failed.')
      } finally {
        setPending(false)
      }
    },
    [mode, onSuccess, router],
  )

  useEffect(() => {
    if (state !== 'connected' || !manager) {
      startedRef.current = false
      return
    }
    if (startedRef.current) return

    startedRef.current = true
    void requestSignature(manager)
  }, [manager, requestSignature, state])

  const busy = pending || state === 'connecting' || state === 'reconnecting'
  const displayError = error ?? connectionError

  return (
    <div className="space-y-3">
      <WizardConnectQRDialog
        show={Boolean(uri && qrUri && state === 'connecting')}
        onClose={() => {
          void disconnect()
        }}
        uri={uri ?? ''}
        qrUri={qrUri ?? ''}
        title="Connect a BCH wallet"
        subtitle="Scan with Cashonize, Paytaca, or another WizardConnect wallet"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null)
            setStatus(null)
            connect()
          }}
          disabled={busy || state === 'connected'}
          className="rounded-lg bg-[var(--t-green)] px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'connected'
            ? walletName
              ? `${walletName} connected`
              : 'Wallet connected'
            : mode === 'link'
              ? 'Connect payout wallet'
              : 'Connect BCH wallet'}
        </button>

        {(state === 'connected' || state === 'disconnected') && (
          <button
            type="button"
            onClick={() => {
              void disconnect()
              setStatus(null)
              setError(null)
            }}
            className="rounded-lg border border-[var(--t-border)] px-3 py-2 text-sm text-[var(--t-muted)] transition hover:text-white"
          >
            Disconnect
          </button>
        )}
      </div>

      {walletName && state === 'connected' && (
        <p className="text-sm text-[var(--t-muted)]">
          Connected to <span className="text-white">{walletName}</span>.
        </p>
      )}
      {error && state === 'connected' && manager && !pending && (
        <button
          type="button"
          onClick={() => {
            void requestSignature(manager)
          }}
          className="rounded-lg border border-[var(--t-border)] px-3 py-2 text-sm text-white transition hover:border-[var(--t-green)]"
        >
          Try signing again
        </button>
      )}
      {status && <p className="text-sm text-[var(--t-muted)]">{status}</p>}
      {displayError && <p className="text-sm text-red-400">{displayError}</p>}
      <p className="text-xs text-[var(--t-muted)]">
        WizardConnect pairs directly with your wallet. Your keys never leave the device.
      </p>
    </div>
  )
}
