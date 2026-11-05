import {
  deriveHdPath,
  deriveHdPathRelative,
  deriveHdPrivateNodeFromBip39Mnemonic,
  deriveHdPublicNode,
  encodeHdPrivateKey,
  encodeHdPublicKey,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PlatformWalletConfigError,
  derivePlatformAddress,
  derivePlatformPrivateKey,
} from './platform-wallet'

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ACCOUNT_PATH = "m/44'/145'/0'"

function testRoot() {
  const root = deriveHdPrivateNodeFromBip39Mnemonic(MNEMONIC)
  if (typeof root === 'string') throw new Error(root)
  return root
}

function expectedAddress(): { address: string; privateKey: Uint8Array; publicKey: Uint8Array } {
  const account = deriveHdPath(testRoot(), ACCOUNT_PATH)
  if (typeof account === 'string') throw new Error(account)

  const child = deriveHdPathRelative(account, '0/0')
  if (typeof child === 'string') throw new Error(child)

  const publicNode = deriveHdPublicNode(child)
  const encoded = publicKeyToP2pkhCashAddress({
    publicKey: publicNode.publicKey,
    prefix: 'bchtest',
  })
  if (typeof encoded === 'string') throw new Error(encoded)

  return { address: encoded.address, privateKey: child.privateKey, publicKey: publicNode.publicKey }
}

function rootXpriv(): string {
  return encodeHdPrivateKey({ node: testRoot(), network: 'testnet' }).hdPrivateKey
}

function accountXpriv(): string {
  const account = deriveHdPath(testRoot(), ACCOUNT_PATH)
  if (typeof account === 'string') throw new Error(account)
  return encodeHdPrivateKey({ node: account, network: 'testnet' }).hdPrivateKey
}

function accountXpub(): string {
  const account = deriveHdPath(testRoot(), ACCOUNT_PATH)
  if (typeof account === 'string') throw new Error(account)
  return encodeHdPublicKey({ node: deriveHdPublicNode(account), network: 'testnet' }).hdPublicKey
}

afterEach(() => {
  delete process.env.PLATFORM_WALLET_XPRIV
  delete process.env.PLATFORM_WALLET_XPUB
  delete process.env.BCH_NETWORK
})

describe('derivePlatformAddress', () => {
  it("derives m/44'/145'/0'/0/<index> from a root xpriv", () => {
    process.env.PLATFORM_WALLET_XPRIV = rootXpriv()

    expect(derivePlatformAddress(0).address).toBe(expectedAddress().address)
  })

  it('accepts an account-level (depth 3) xpriv', () => {
    process.env.PLATFORM_WALLET_XPRIV = accountXpriv()

    expect(derivePlatformAddress(0).address).toBe(expectedAddress().address)
  })

  it('derives public addresses from the xpub without a private key', () => {
    process.env.PLATFORM_WALLET_XPUB = accountXpub()

    expect(derivePlatformAddress(0).address).toBe(expectedAddress().address)
  })

  it('uses the configured mainnet prefix', () => {
    process.env.PLATFORM_WALLET_XPUB = accountXpub()
    process.env.BCH_NETWORK = 'mainnet'

    const address = derivePlatformAddress(0).address
    expect(address.startsWith('bitcoincash:')).toBe(true)
  })

  it('rejects an xpub that is not account-level', () => {
    const depthOne = deriveHdPathRelative(testRoot(), '0')
    if (typeof depthOne === 'string') throw new Error(depthOne)
    process.env.PLATFORM_WALLET_XPUB = encodeHdPublicKey({
      node: deriveHdPublicNode(depthOne),
      network: 'testnet',
    }).hdPublicKey

    expect(() => derivePlatformAddress(0)).toThrow(PlatformWalletConfigError)
  })

  it('derives the spending key that matches the public address', () => {
    process.env.PLATFORM_WALLET_XPRIV = rootXpriv()

    const expected = expectedAddress()
    expect(derivePlatformPrivateKey(0)).toEqual(expected.privateKey)
    expect(derivePlatformAddress(0).publicKey).toEqual(expected.publicKey)
  })

  it('fails closed when no key is configured', () => {
    expect(() => derivePlatformAddress(0)).toThrow(PlatformWalletConfigError)
  })
})
