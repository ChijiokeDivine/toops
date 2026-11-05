import {
  binToHex,
  decodeCashAddress,
  decodeTransactionBch,
  deriveHdPath,
  deriveHdPrivateNodeFromBip39Mnemonic,
  encodeDataPush,
  encodeLockingBytecodeP2pkh,
  encodeTransactionBch,
  generateSigningSerializationBch,
  hash256,
  hexToBin,
  instantiateSecp256k1,
  publicKeyToP2pkhCashAddress,
} from '@bitauth/libauth'
import type { Output, TransactionCommon } from '@bitauth/libauth'
import { describe, expect, it } from 'vitest'
import {
  WALLET_CHALLENGE_VALUE_SATS,
  createWalletChallenge,
  verifyWalletChallenge,
} from './wallet-auth'

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SIGNING_SERIALIZATION_TYPE = 0x41

async function fixture() {
  const root = deriveHdPrivateNodeFromBip39Mnemonic(MNEMONIC)
  if (typeof root === 'string') throw new Error(root)

  const node = deriveHdPath(root, "m/44'/145'/0'/0/0")
  if (typeof node === 'string') throw new Error(node)

  const secp = await instantiateSecp256k1()
  const publicKey = secp.derivePublicKeyCompressed(node.privateKey)
  if (typeof publicKey === 'string') throw new Error(publicKey)

  const encoded = publicKeyToP2pkhCashAddress({ publicKey, prefix: 'bchtest' })
  if (typeof encoded === 'string') throw new Error(encoded)

  return { node, secp, publicKey, address: encoded.address }
}

async function signChallenge(params: {
  transactionHex: string
  address: string
  privateKey: Uint8Array
  publicKey: Uint8Array
  secp: Awaited<ReturnType<typeof instantiateSecp256k1>>
}): Promise<string> {
  const transaction = decodeTransactionBch(hexToBin(params.transactionHex))
  if (typeof transaction === 'string') throw new Error(transaction)

  const decoded = decodeCashAddress(params.address)
  if (typeof decoded === 'string') throw new Error(decoded)

  const lockingBytecode = encodeLockingBytecodeP2pkh(decoded.payload)
  const sourceOutputs: Output[] = [{ lockingBytecode, valueSatoshis: WALLET_CHALLENGE_VALUE_SATS }]

  const preimage = generateSigningSerializationBch(
    { inputIndex: 0, sourceOutputs, transaction },
    {
      coveredBytecode: lockingBytecode,
      signingSerializationType: Uint8Array.of(SIGNING_SERIALIZATION_TYPE),
    },
  )

  const signature = params.secp.signMessageHashDER(params.privateKey, hash256(preimage))
  if (typeof signature === 'string') throw new Error(signature)

  const signatureWithType = new Uint8Array(signature.length + 1)
  signatureWithType.set(signature)
  signatureWithType[signature.length] = SIGNING_SERIALIZATION_TYPE

  const input = transaction.inputs[0]
  if (!input) throw new Error('Challenge transaction has no input')
  input.unlockingBytecode = new Uint8Array([
    ...encodeDataPush(signatureWithType),
    ...encodeDataPush(params.publicKey),
  ])

  return binToHex(encodeTransactionBch(transaction as TransactionCommon))
}

describe('wallet challenge verification', () => {
  it('verifies a signature produced by the wallet key', async () => {
    const { node, secp, publicKey, address } = await fixture()
    const nonce = 'a'.repeat(32)
    const challenge = createWalletChallenge(address, nonce)
    expect(challenge).not.toBeNull()
    if (!challenge) return

    const signedTransaction = await signChallenge({
      transactionHex: challenge.transaction,
      address,
      privateKey: node.privateKey,
      publicKey,
      secp,
    })

    await expect(
      verifyWalletChallenge({
        address,
        nonce,
        expectedTransaction: challenge.transaction,
        signedTransaction,
      }),
    ).resolves.toBe(true)
  })

  it('rejects a challenge signed for a different transaction', async () => {
    const { node, secp, publicKey, address } = await fixture()
    const challenge = createWalletChallenge(address, 'b'.repeat(32))
    const other = createWalletChallenge(address, 'c'.repeat(32))
    expect(challenge).not.toBeNull()
    expect(other).not.toBeNull()
    if (!challenge || !other) return

    const signedTransaction = await signChallenge({
      transactionHex: challenge.transaction,
      address,
      privateKey: node.privateKey,
      publicKey,
      secp,
    })

    await expect(
      verifyWalletChallenge({
        address,
        nonce: 'c'.repeat(32),
        expectedTransaction: other.transaction,
        signedTransaction,
      }),
    ).resolves.toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const { secp, address } = await fixture()
    const otherRoot = deriveHdPrivateNodeFromBip39Mnemonic(
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
    )
    if (typeof otherRoot === 'string') throw new Error(otherRoot)
    const otherNode = deriveHdPath(otherRoot, "m/44'/145'/0'/0/0")
    if (typeof otherNode === 'string') throw new Error(otherNode)
    const otherPublicKey = secp.derivePublicKeyCompressed(otherNode.privateKey)
    if (typeof otherPublicKey === 'string') throw new Error(otherPublicKey)

    const nonce = 'd'.repeat(32)
    const challenge = createWalletChallenge(address, nonce)
    expect(challenge).not.toBeNull()
    if (!challenge) return

    const signedTransaction = await signChallenge({
      transactionHex: challenge.transaction,
      address,
      privateKey: otherNode.privateKey,
      publicKey: otherPublicKey,
      secp,
    })

    await expect(
      verifyWalletChallenge({
        address,
        nonce,
        expectedTransaction: challenge.transaction,
        signedTransaction,
      }),
    ).resolves.toBe(false)
  })

  it('only builds P2PKH challenges', () => {
    expect(createWalletChallenge('not-an-address', 'nonce')).toBeNull()
  })
})
