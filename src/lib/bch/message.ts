import {
  decodeCashAddress,
  instantiateSecp256k1,
  publicKeyToP2pkhCashAddress,
  sha256,
} from '@bitauth/libauth'
import { getAddressPrefix } from './network'

const MESSAGE_PREFIX = '\x18Bitcoin Signed Message:\n'

export function createLoginMessage(params: {
  address: string
  nonce: string
  issuedAt: Date
}): string {
  return [
    'toops wants you to sign in with your Bitcoin Cash wallet.',
    '',
    `Address: ${params.address}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt.toISOString()}`,
  ].join('\n')
}

export function extractNonce(message: string): string | null {
  const match = /^Nonce: ([0-9a-f]+)$/m.exec(message)
  return match?.[1] ?? null
}

function encodeVarInt(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.of(value)

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3)
    bytes[0] = 0xfd
    new DataView(bytes.buffer).setUint16(1, value, true)
    return bytes
  }

  const bytes = new Uint8Array(5)
  bytes[0] = 0xfe
  new DataView(bytes.buffer).setUint32(1, value, true)
  return bytes
}

/** Serialize a message using the Bitcoin Signed Message convention. */
export function serializeSignedMessage(message: string): Uint8Array {
  const prefix = new TextEncoder().encode(MESSAGE_PREFIX)
  const body = new TextEncoder().encode(message)
  const length = encodeVarInt(body.length)

  const payload = new Uint8Array(prefix.length + length.length + body.length)
  payload.set(prefix, 0)
  payload.set(length, prefix.length)
  payload.set(body, prefix.length + length.length)
  return payload
}

export function signedMessageHash(message: string): Uint8Array {
  return sha256.hash(sha256.hash(serializeSignedMessage(message)))
}

function addressPayload(address: string): Uint8Array | null {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') return null
  return decoded.payload
}

function publicKeyMatchesAddress(publicKey: Uint8Array, payload: Uint8Array): boolean {
  const encoded = publicKeyToP2pkhCashAddress({
    publicKey,
    prefix: getAddressPrefix(),
    throwErrors: false,
  })

  if (typeof encoded === 'string') return false
  const encodedAddress = decodeCashAddress(encoded.address)
  if (typeof encodedAddress === 'string') return false
  return Buffer.from(encodedAddress.payload).equals(Buffer.from(payload))
}

/**
 * Verify an Electron Cash / Bitcoin Signed Message signature returned by
 * `bch_signMessage` over WalletConnect.
 *
 * The payload is a base64 65-byte compact signature: header byte
 * (27 + recovery id + compressed flag), then r and s.
 */
export async function verifyBchMessageSignature(params: {
  address: string
  message: string
  signature: string
}): Promise<boolean> {
  const payload = addressPayload(params.address)
  if (!payload) return false

  const raw = Buffer.from(params.signature.trim(), 'base64')
  if (raw.length !== 64 && raw.length !== 65) return false

  const messageHash = signedMessageHash(params.message)
  const secp = await instantiateSecp256k1()

  const candidates: Array<{
    signature: Uint8Array
    recoveryId: 0 | 1 | 2 | 3
    compressed: boolean
  }> = []

  if (raw.length === 65) {
    const flag = raw[0] - 27
    if (flag < 0 || flag > 7) return false

    candidates.push({
      signature: raw.subarray(1),
      recoveryId: (flag & 3) as 0 | 1 | 2 | 3,
      compressed: (flag & 4) === 4,
    })
  } else {
    // Some wallets return a bare compact signature. Try every recovery id
    // and both encodings; address matching still proves ownership.
    for (const recoveryId of [0, 1, 2, 3] as const) {
      candidates.push({ signature: raw, recoveryId, compressed: true })
      candidates.push({ signature: raw, recoveryId, compressed: false })
    }
  }

  for (const candidate of candidates) {
    const publicKey = candidate.compressed
      ? secp.recoverPublicKeyCompressed(candidate.signature, candidate.recoveryId, messageHash)
      : secp.recoverPublicKeyUncompressed(candidate.signature, candidate.recoveryId, messageHash)

    if (typeof publicKey === 'string') continue
    if (publicKeyMatchesAddress(publicKey, payload)) return true
  }

  return false
}
