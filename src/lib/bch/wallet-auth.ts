import 'server-only'

import {
  binToHex,
  decodeAuthenticationInstructions,
  decodeCashAddress,
  decodeTransactionBch,
  encodeLockingBytecodeP2pkh,
  encodeTransactionBch,
  generateSigningSerializationBch,
  hash256,
  hexToBin,
  instantiateSecp256k1,
  publicKeyToP2pkhCashAddress,
  sha256,
} from '@bitauth/libauth'
import type { Output, TransactionCommon } from '@bitauth/libauth'
import { getAddressPrefix } from './network'

/** Value reported to the wallet for the synthetic challenge UTXO. */
export const WALLET_CHALLENGE_VALUE_SATS = 1000n
const CHALLENGE_OUTPUT_VALUE_SATS = 546n

export type WalletChallengeSourceOutput = {
  outpointIndex: number
  outpointTransactionHash: string
  sequenceNumber: number
  /** Always empty for a source output; kept for `WcSourceOutput` compatibility. */
  unlockingBytecode: string
  valueSatoshis: string
  lockingBytecode: string
}

export type WalletChallenge = {
  message: string
  transaction: string
  sourceOutputs: WalletChallengeSourceOutput[]
}

function p2pkhLockingBytecode(address: string): Uint8Array | null {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') return null
  if (decoded.type !== 'p2pkh') return null
  return encodeLockingBytecodeP2pkh(decoded.payload)
}

function challengeOutpointHash(nonce: string): Uint8Array {
  return sha256.hash(new TextEncoder().encode(`toops-wallet-challenge:${nonce}`))
}

function challengeTransaction(address: string, nonce: string): TransactionCommon | null {
  const lockingBytecode = p2pkhLockingBytecode(address)
  if (!lockingBytecode) return null

  return {
    version: 2,
    inputs: [
      {
        outpointIndex: 0,
        outpointTransactionHash: challengeOutpointHash(nonce),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: new Uint8Array(),
      },
    ],
    outputs: [
      {
        lockingBytecode,
        valueSatoshis: CHALLENGE_OUTPUT_VALUE_SATS,
      },
    ],
    locktime: 0,
  }
}

/**
 * Builds a deterministic zero-risk challenge transaction. The outpoint is
 * synthetic (derived from the nonce), so nothing is spent; the wallet only
 * proves control of the P2PKH key by signing it.
 */
export function createWalletChallenge(address: string, nonce: string): WalletChallenge | null {
  const tx = challengeTransaction(address, nonce)
  if (!tx) return null

  const lockingBytecode = p2pkhLockingBytecode(address)
  if (!lockingBytecode) return null

  return {
    message: [
      'toops wallet verification',
      '',
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      '',
      'This signature proves you control this wallet. It cannot move funds.',
    ].join('\n'),
    transaction: binToHex(encodeTransactionBch(tx)),
    sourceOutputs: [
      {
        outpointIndex: 0,
        outpointTransactionHash: binToHex(challengeOutpointHash(nonce)),
        sequenceNumber: 0xffffffff,
        unlockingBytecode: '',
        valueSatoshis: `<bigint: ${WALLET_CHALLENGE_VALUE_SATS}n>`,
        lockingBytecode: binToHex(lockingBytecode),
      },
    ],
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return a.every((byte, index) => byte === b[index])
}

function sameStructure(expected: TransactionCommon, actual: TransactionCommon): boolean {
  if (expected.version !== actual.version) return false
  if (expected.locktime !== actual.locktime) return false
  if (expected.inputs.length !== 1 || actual.inputs.length !== 1) return false
  if (expected.outputs.length !== actual.outputs.length) return false

  const expectedInput = expected.inputs[0]
  const actualInput = actual.inputs[0]
  if (!expectedInput || !actualInput) return false
  if (expectedInput.outpointIndex !== actualInput.outpointIndex) return false
  if (expectedInput.sequenceNumber !== actualInput.sequenceNumber) return false
  if (!sameBytes(expectedInput.outpointTransactionHash, actualInput.outpointTransactionHash)) {
    return false
  }

  return expected.outputs.every((output, index) => {
    const actualOutput = actual.outputs[index]
    if (!actualOutput) return false
    return (
      output.valueSatoshis === actualOutput.valueSatoshis &&
      sameBytes(output.lockingBytecode, actualOutput.lockingBytecode)
    )
  })
}

function extractSignaturePushes(unlockingBytecode: Uint8Array): Uint8Array[] {
  return decodeAuthenticationInstructions(unlockingBytecode)
    .map((instruction) => ('data' in instruction ? instruction.data : undefined))
    .filter((data): data is Uint8Array => data instanceof Uint8Array)
}

/**
 * Verifies the wallet's signature over the challenge transaction. The signed
 * transaction must match the server-issued template exactly (except for the
 * unlocking scripts), which binds the signature to the nonce.
 */
export async function verifyWalletChallenge(params: {
  address: string
  nonce: string
  expectedTransaction: string
  signedTransaction: string
}): Promise<boolean> {
  let signed: TransactionCommon | string
  try {
    signed = decodeTransactionBch(hexToBin(params.signedTransaction.trim()))
  } catch {
    return false
  }
  if (typeof signed === 'string') return false

  let expected: TransactionCommon | string
  try {
    expected = decodeTransactionBch(hexToBin(params.expectedTransaction))
  } catch {
    return false
  }
  if (typeof expected === 'string') return false
  if (!sameStructure(expected, signed)) return false

  const input = signed.inputs[0]
  if (!input) return false

  const pushes = extractSignaturePushes(input.unlockingBytecode)
  const signatureWithType = pushes[0]
  const publicKey = pushes[1]
  if (!signatureWithType || !publicKey) return false
  if (signatureWithType.length < 9) return false
  if (publicKey.length !== 33 && publicKey.length !== 65) return false

  const signingSerializationType = signatureWithType[signatureWithType.length - 1]
  if (typeof signingSerializationType !== 'number') return false
  const signature = signatureWithType.subarray(0, signatureWithType.length - 1)

  // BCH signing serialization commits to the value of the output being spent,
  // not the output created by the challenge transaction. The wallet signs the
  // synthetic source output (see `sourceOutputs` in `createWalletChallenge`),
  // so verification must use the same value.
  const sourceOutput: Output = {
    lockingBytecode: p2pkhLockingBytecode(params.address) ?? new Uint8Array(),
    valueSatoshis: WALLET_CHALLENGE_VALUE_SATS,
  }

  const preimage = generateSigningSerializationBch(
    { inputIndex: 0, sourceOutputs: [sourceOutput], transaction: signed },
    {
      coveredBytecode: sourceOutput.lockingBytecode,
      signingSerializationType: Uint8Array.of(signingSerializationType),
    },
  )
  const messageHash = hash256(preimage)

  const secp = await instantiateSecp256k1()
  // Cashonize (and other WizardConnect wallets) produce 64-byte Schnorr
  // signatures; legacy wallets may produce DER-encoded ECDSA. Accept both.
  const signatureIsValid =
    signature.length === 64
      ? secp.verifySignatureSchnorr(signature, publicKey, messageHash)
      : secp.verifySignatureDER(signature, publicKey, messageHash)
  if (!signatureIsValid) return false

  const encoded = publicKeyToP2pkhCashAddress({
    publicKey,
    prefix: getAddressPrefix(),
    throwErrors: false,
  })
  if (typeof encoded === 'string') return false

  const derivedAddress = decodeCashAddress(encoded.address)
  if (typeof derivedAddress === 'string') return false

  const decodedAddress = decodeCashAddress(params.address)
  if (typeof decodedAddress === 'string') return false
  if (decodedAddress.type !== 'p2pkh') return false

  return sameBytes(derivedAddress.payload, decodedAddress.payload)
}
