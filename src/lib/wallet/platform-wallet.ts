import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import {
  deriveHdPath,
  deriveHdPrivateNodeFromBip39Mnemonic,
  generateBip39Mnemonic,
  instantiateSecp256k1,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import type { PlatformWallet } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAddressPrefix, getBchNetwork } from '@/lib/bch/network'

const DERIVATION_PATH = "m/44'/145'/0'/0/0"

function encryptionKey(): Buffer {
  const raw = process.env.WALLET_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('WALLET_ENCRYPTION_KEY is not set')
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('WALLET_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }
  return key
}

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptMnemonic(mnemonic: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptMnemonic(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split('.')
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported wallet encryption payload')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

async function generateWalletMaterial() {
  const mnemonic = generateBip39Mnemonic()
  const root = deriveHdPrivateNodeFromBip39Mnemonic(mnemonic)
  const node = deriveHdPath(root, DERIVATION_PATH)
  if (typeof node === 'string') {
    throw new Error('Unable to derive platform wallet')
  }

  const secp = await instantiateSecp256k1()
  const publicKey = secp.derivePublicKeyCompressed(node.privateKey)
  if (typeof publicKey === 'string') {
    throw new Error('Unable to derive platform wallet public key')
  }
  const encoded = publicKeyToP2pkhCashAddress({
    publicKey,
    prefix: getAddressPrefix(),
  })

  if (typeof encoded === 'string') {
    throw new Error('Unable to encode platform wallet address')
  }

  return {
    mnemonic,
    address: encoded.address,
    publicKey: Buffer.from(publicKey).toString('hex'),
  }
}

export async function ensurePlatformWallet(userId: string): Promise<PlatformWallet> {
  const existing = await prisma.platformWallet.findUnique({ where: { userId } })
  if (existing) return existing

  const material = await generateWalletMaterial()

  try {
    return await prisma.platformWallet.create({
      data: {
        userId,
        address: material.address,
        publicKey: material.publicKey,
        encryptedMnemonic: encryptMnemonic(material.mnemonic),
        network: getBchNetwork(),
      },
    })
  } catch (error) {
    // Another request may have created the wallet first.
    const raced = await prisma.platformWallet.findUnique({ where: { userId } })
    if (raced) return raced
    throw error
  }
}
