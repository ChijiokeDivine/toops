import 'server-only'

import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { normalizeCashAddress } from '@/lib/bch/address'
import {
  createWalletChallenge,
  verifyWalletChallenge,
  type WalletChallenge,
} from '@/lib/bch/wallet-auth'

const CHALLENGE_TTL_MS = 10 * 60 * 1000

export class WalletChallengeError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'WalletChallengeError'
    this.status = status
  }
}

export type IssuedWalletChallenge = WalletChallenge & {
  address: string
  nonce: string
  expiresAt: Date
}

/**
 * Removes one-time challenges that can no longer be verified. Used before issuing
 * a new challenge and by the scheduled sync, so abandoned sign-ins do not linger.
 */
export async function cleanupExpiredWalletChallenges(): Promise<number> {
  const result = await prisma.authChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}

export async function issueWalletChallenge(rawAddress: string): Promise<IssuedWalletChallenge> {
  const address = normalizeCashAddress(rawAddress)
  if (!address) {
    throw new WalletChallengeError('Unsupported or invalid Bitcoin Cash address')
  }

  // Cleanup is best-effort: a stale pooled connection should never block a
  // fresh sign-in attempt. Prisma reconnects on the next query.
  await cleanupExpiredWalletChallenges().catch((error: unknown) => {
    console.warn('wallet challenge cleanup failed', error)
  })

  const nonce = randomBytes(16).toString('hex')
  const challenge = createWalletChallenge(address, nonce)
  if (!challenge) {
    throw new WalletChallengeError('Unable to build a wallet challenge')
  }

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  await prisma.authChallenge.create({
    data: {
      address,
      nonce,
      kind: 'TRANSACTION',
      message: challenge.message,
      transaction: challenge.transaction,
      expiresAt,
    },
  })

  return { ...challenge, address, nonce, expiresAt }
}

export async function consumeWalletChallenge(params: {
  rawAddress: string
  nonce: string
  signedTransaction: string
}): Promise<{ address: string; nonce: string }> {
  const address = normalizeCashAddress(params.rawAddress)
  if (!address) {
    throw new WalletChallengeError('Invalid wallet address')
  }

  const challenge = await prisma.authChallenge.findUnique({ where: { nonce: params.nonce } })
  if (!challenge) {
    throw new WalletChallengeError('Unknown or expired challenge', 401)
  }
  if (challenge.kind !== 'TRANSACTION' || !challenge.transaction) {
    throw new WalletChallengeError('Challenge type mismatch', 401)
  }
  if (challenge.usedAt) {
    throw new WalletChallengeError('Challenge was already used', 401)
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new WalletChallengeError('Challenge has expired', 401)
  }
  if (challenge.address !== address) {
    throw new WalletChallengeError('Challenge does not match this wallet', 401)
  }

  const valid = await verifyWalletChallenge({
    address,
    nonce: challenge.nonce,
    expectedTransaction: challenge.transaction,
    signedTransaction: params.signedTransaction,
  })
  if (!valid) {
    throw new WalletChallengeError('Wallet signature verification failed', 401)
  }

  const consumed = await prisma.authChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (consumed.count !== 1) {
    throw new WalletChallengeError('Challenge was already used', 401)
  }

  return { address, nonce: challenge.nonce }
}
