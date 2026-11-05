import {
  deriveHdPath,
  deriveHdPrivateNodeFromBip39Mnemonic,
  generateBip39Mnemonic,
  instantiateSecp256k1,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import { describe, expect, it } from 'vitest'
import { createLoginMessage, signedMessageHash, verifyBchMessageSignature } from './message'

async function createTestWallet() {
  const mnemonic = generateBip39Mnemonic()
  const root = deriveHdPrivateNodeFromBip39Mnemonic(mnemonic)
  const node = deriveHdPath(root, "m/44'/145'/0'/0/0")
  if (typeof node === 'string') throw new Error('Failed to derive test wallet')

  const secp = await instantiateSecp256k1()
  const publicKey = secp.derivePublicKeyCompressed(node.privateKey)
  if (typeof publicKey === 'string') throw new Error('Failed to derive test public key')

  const encoded = publicKeyToP2pkhCashAddress({ publicKey, prefix: 'bchtest' })
  if (typeof encoded === 'string') throw new Error('Failed to encode test address')

  return { address: encoded.address, privateKey: node.privateKey, secp }
}

describe('verifyBchMessageSignature', () => {
  it('accepts a valid Electron Cash style signature', async () => {
    const wallet = await createTestWallet()
    const message = createLoginMessage({
      address: wallet.address,
      nonce: 'deadbeef',
      issuedAt: new Date('2026-11-05T10:00:00.000Z'),
    })

    const recoverable = wallet.secp.signMessageHashRecoverableCompact(
      wallet.privateKey,
      signedMessageHash(message),
    )
    if (typeof recoverable === 'string') throw new Error('Signing failed')
    const { signature, recoveryId } = recoverable

    const signed = Buffer.concat([Buffer.from([27 + recoveryId + 4]), Buffer.from(signature)])
    const base64 = signed.toString('base64')

    await expect(
      verifyBchMessageSignature({ address: wallet.address, message, signature: base64 }),
    ).resolves.toBe(true)

    await expect(
      verifyBchMessageSignature({
        address: wallet.address,
        message: `${message} tampered`,
        signature: base64,
      }),
    ).resolves.toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const wallet = await createTestWallet()
    const other = await createTestWallet()
    const message = createLoginMessage({
      address: wallet.address,
      nonce: 'cafebabe',
      issuedAt: new Date('2026-11-05T10:00:00.000Z'),
    })

    const recoverable = other.secp.signMessageHashRecoverableCompact(
      other.privateKey,
      signedMessageHash(message),
    )
    if (typeof recoverable === 'string') throw new Error('Signing failed')
    const { signature, recoveryId } = recoverable
    const signed = Buffer.concat([Buffer.from([27 + recoveryId + 4]), Buffer.from(signature)])

    await expect(
      verifyBchMessageSignature({
        address: wallet.address,
        message,
        signature: signed.toString('base64'),
      }),
    ).resolves.toBe(false)
  })
})
