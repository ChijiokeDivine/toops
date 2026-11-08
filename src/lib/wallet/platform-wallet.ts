import 'server-only'

import {
  decodeHdPrivateKey,
  decodeHdPublicKey,
  deriveHdPath,
  deriveHdPathRelative,
  deriveHdPublicNode,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import type { HdPrivateNodeValid, HdPublicNodeValid } from '@bitauth/libauth'
import { Prisma } from '@prisma/client'
import type { PlatformWallet } from '@prisma/client'
import { prisma } from '@/lib/db'
import { toTokenAwareAddress } from '@/lib/bch/address'
import { getAddressPrefix, getBchNetwork } from '@/lib/bch/network'

/**
 * BCH BIP44 account path. `PLATFORM_WALLET_XPRIV` may be either the root key
 * (depth 0) or this account key (depth 3). `PLATFORM_WALLET_XPUB`, when set,
 * must be the account-level public key (depth 3).
 */
const ACCOUNT_PATH = "m/44'/145'/0'"
const RECEIVE_PATH = '0'

export class PlatformWalletConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformWalletConfigError'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isPlatformWalletConfigured(): boolean {
  return Boolean(process.env.PLATFORM_WALLET_XPRIV || process.env.PLATFORM_WALLET_XPUB)
}

function accountPrivateNode(): HdPrivateNodeValid {
  const xpriv = process.env.PLATFORM_WALLET_XPRIV
  if (!xpriv) {
    throw new PlatformWalletConfigError('PLATFORM_WALLET_XPRIV is not configured')
  }

  const decoded = decodeHdPrivateKey(xpriv.trim())
  if (typeof decoded === 'string') {
    throw new PlatformWalletConfigError(`Invalid PLATFORM_WALLET_XPRIV: ${decoded}`)
  }

  if (decoded.node.depth === 3) return decoded.node
  if (decoded.node.depth !== 0) {
    throw new PlatformWalletConfigError(
      'PLATFORM_WALLET_XPRIV must be a root key (depth 0) or account key (depth 3)',
    )
  }

  const account = deriveHdPath(decoded.node, ACCOUNT_PATH)
  if (typeof account === 'string') {
    throw new PlatformWalletConfigError(`Unable to derive platform account: ${account}`)
  }
  return account
}

function accountPublicNode(): HdPublicNodeValid {
  const xpub = process.env.PLATFORM_WALLET_XPUB?.trim()
  if (xpub) {
    const decoded = decodeHdPublicKey(xpub)
    if (typeof decoded === 'string') {
      throw new PlatformWalletConfigError(`Invalid PLATFORM_WALLET_XPUB: ${decoded}`)
    }
    if (decoded.node.depth !== 3) {
      throw new PlatformWalletConfigError(
        "PLATFORM_WALLET_XPUB must be the account-level key at m/44'/145'/0' (depth 3)",
      )
    }
    return decoded.node
  }

  return deriveHdPublicNode(accountPrivateNode())
}

function derivePublicNode(index: number): HdPublicNodeValid {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new PlatformWalletConfigError('Platform wallet index is invalid')
  }

  const child = deriveHdPathRelative(accountPublicNode(), `${RECEIVE_PATH}/${index}`, {
    throwErrors: false,
  })
  if (typeof child === 'string') {
    throw new PlatformWalletConfigError(`Unable to derive platform address: ${child}`)
  }
  return child
}

export function derivePlatformAddress(index: number): {
  address: string
  tokenAddress: string
  publicKey: Uint8Array
} {
  const node = derivePublicNode(index)
  const encoded = publicKeyToP2pkhCashAddress({
    publicKey: node.publicKey,
    prefix: getAddressPrefix(),
  })
  if (typeof encoded === 'string') {
    throw new PlatformWalletConfigError(`Unable to encode platform address: ${encoded}`)
  }

  return {
    address: encoded.address,
    tokenAddress: toTokenAwareAddress(encoded.address),
    publicKey: node.publicKey,
  }
}

/** Token-aware form of a stored platform address (same key, type-2 encoding). */
export function getPlatformTokenAddress(address: string): string {
  return toTokenAwareAddress(address)
}

/**
 * Derives the spending key only when a withdrawal is being signed. The key is
 * returned to the caller and must never be persisted or logged.
 */
export function derivePlatformPrivateKey(index: number): Uint8Array {
  const child = deriveHdPathRelative(accountPrivateNode(), `${RECEIVE_PATH}/${index}`, {
    throwErrors: false,
  })
  if (typeof child === 'string') {
    throw new PlatformWalletConfigError(`Unable to derive platform private key: ${child}`)
  }
  return child.privateKey
}

async function allocateIndex(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('platform_wallet_index_seq') AS nextval
  `
  const value = rows[0]?.nextval
  if (typeof value === 'undefined') {
    throw new PlatformWalletConfigError('Unable to allocate a platform wallet index')
  }
  return Number(value)
}

export async function ensurePlatformWallet(userId: string): Promise<PlatformWallet> {
  const existing = await prisma.platformWallet.findUnique({ where: { userId } })
  if (existing) return existing

  if (!isPlatformWalletConfigured()) {
    throw new PlatformWalletConfigError('Platform wallets are not configured on this deployment')
  }

  // The sequence allocates indexes atomically; a unique-constraint retry
  // handles the (unlikely) case of a concurrent wallet creation for the same
  // user winning the race.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const index = await allocateIndex()
    const { address } = derivePlatformAddress(index)

    try {
      return await prisma.platformWallet.create({
        data: {
          userId,
          address,
          derivationIndex: index,
          network: getBchNetwork(),
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.platformWallet.findUnique({ where: { userId } })
        if (raced) return raced
        continue
      }
      throw error
    }
  }

  throw new Error('Unable to create a platform wallet after several attempts')
}

export async function getPlatformWallet(userId: string): Promise<PlatformWallet | null> {
  return prisma.platformWallet.findUnique({ where: { userId } })
}

export function platformWalletErrorMessage(error: unknown): string {
  if (error instanceof PlatformWalletConfigError) return error.message
  return errorMessage(error)
}
