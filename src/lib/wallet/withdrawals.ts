import 'server-only'

import {
  binToHex,
  decodeCashAddress,
  encodeDataPush,
  encodeLockingBytecodeP2pkh,
  encodeTransactionBch,
  generateSigningSerializationBch,
  hash256,
  hexToBin,
  instantiateSecp256k1,
} from '@bitauth/libauth'
import type { Output, TransactionCommon } from '@bitauth/libauth'
import { prisma } from '@/lib/db'
import { broadcastTransaction, getAddressUtxos, type ElectrumUtxo } from '@/lib/bch/electrum'
import { normalizeCashAddress } from '@/lib/bch/address'
import { derivePlatformPrivateKey } from './platform-wallet'

const DUST_THRESHOLD_SATS = 546n
const MIN_WITHDRAWAL_SATS = 1_000n
const SIGNING_SERIALIZATION_TYPE = 0x41 // SIGHASH_ALL | SIGHASH_FORKID

export class WithdrawalError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'WithdrawalError'
    this.status = status
  }
}

export function getWithdrawalFeeSats(): bigint {
  const configured = Number(process.env.WITHDRAWAL_FEE_SATS ?? '1000')
  return BigInt(Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 1000)
}

function p2pkhLockingBytecode(address: string): Uint8Array {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') {
    throw new WithdrawalError(`Invalid address: ${decoded}`)
  }
  if (decoded.type !== 'p2pkh') {
    throw new WithdrawalError('Withdrawals currently support P2PKH addresses only')
  }
  return encodeLockingBytecodeP2pkh(decoded.payload)
}

function normalizeAddress(address: string): string {
  const normalized = normalizeCashAddress(address)
  if (!normalized) {
    throw new WithdrawalError('Invalid BCH address')
  }
  return normalized
}

export type BuiltWithdrawal = {
  rawTransactionHex: string
  feeSats: bigint
  inputSats: bigint
  selectedUtxos: ElectrumUtxo[]
}

/**
 * Builds and signs a P2PKH withdrawal from the user's HD platform address.
 * The private key is derived in memory and is not returned.
 */
export async function buildSignedWithdrawal(params: {
  platformAddress: string
  derivationIndex: number
  toAddress: string
  amountSats: bigint
  utxos?: ElectrumUtxo[]
}): Promise<BuiltWithdrawal> {
  const { platformAddress, derivationIndex, toAddress, amountSats } = params
  if (amountSats < MIN_WITHDRAWAL_SATS) {
    throw new WithdrawalError(`Minimum withdrawal is ${MIN_WITHDRAWAL_SATS} sats`)
  }

  const platformLocking = p2pkhLockingBytecode(platformAddress)
  const destinationLocking = p2pkhLockingBytecode(toAddress)
  const utxos =
    params.utxos ??
    (await getAddressUtxos(platformAddress).catch((error: unknown) => {
      throw new WithdrawalError(
        `Unable to load platform wallet UTXOs: ${error instanceof Error ? error.message : String(error)}`,
        502,
      )
    }))

  if (utxos.length === 0) {
    throw new WithdrawalError('The platform wallet has no spendable outputs yet', 409)
  }

  const sorted = [...utxos].sort((a, b) => b.value - a.value)
  const selected: ElectrumUtxo[] = []
  let inputSats = 0n
  let feeSats = getWithdrawalFeeSats()

  for (const utxo of sorted) {
    const value = BigInt(utxo.value)
    selected.push(utxo)
    inputSats += value

    // 1 sat/byte estimate plus the configured floor.
    const estimatedSize = 10 + selected.length * 148 + 2 * 34
    const estimatedFee = BigInt(Math.ceil(estimatedSize * 1) + 100)
    feeSats = estimatedFee > feeSats ? estimatedFee : feeSats

    if (inputSats >= amountSats + feeSats) break
  }

  if (inputSats < amountSats + feeSats) {
    throw new WithdrawalError('The platform wallet does not have enough confirmed funds', 409)
  }

  let changeSats = inputSats - amountSats - feeSats
  if (changeSats > 0n && changeSats < DUST_THRESHOLD_SATS) {
    feeSats += changeSats
    changeSats = 0n
  }

  const outputs: Output[] = [{ lockingBytecode: destinationLocking, valueSatoshis: amountSats }]
  if (changeSats >= DUST_THRESHOLD_SATS) {
    outputs.push({ lockingBytecode: platformLocking, valueSatoshis: changeSats })
  }

  const sourceOutputs: Output[] = selected.map(() => ({
    lockingBytecode: platformLocking,
    valueSatoshis: 0n,
  }))
  selected.forEach((utxo, index) => {
    const output = sourceOutputs[index]
    if (output) output.valueSatoshis = BigInt(utxo.value)
  })

  const transaction: TransactionCommon = {
    version: 2,
    inputs: selected.map((utxo) => ({
      outpointIndex: utxo.tx_pos,
      outpointTransactionHash: hexToBin(utxo.tx_hash),
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
    })),
    outputs,
    locktime: 0,
  }

  const privateKey = derivePlatformPrivateKey(derivationIndex)
  try {
    const secp = await instantiateSecp256k1()
    const publicKey = secp.derivePublicKeyCompressed(privateKey)
    if (typeof publicKey === 'string') {
      throw new WithdrawalError('Unable to derive platform wallet public key', 500)
    }

    transaction.inputs.forEach((input, inputIndex) => {
      const sourceOutput = sourceOutputs[inputIndex]
      if (!sourceOutput) throw new WithdrawalError('Missing source output', 500)

      const preimage = generateSigningSerializationBch(
        { inputIndex, sourceOutputs, transaction },
        {
          coveredBytecode: sourceOutput.lockingBytecode,
          signingSerializationType: Uint8Array.of(SIGNING_SERIALIZATION_TYPE),
        },
      )
      const signature = secp.signMessageHashDER(privateKey, hash256(preimage))
      if (typeof signature === 'string') {
        throw new WithdrawalError(`Unable to sign withdrawal: ${signature}`, 500)
      }

      const signatureWithType = new Uint8Array(signature.length + 1)
      signatureWithType.set(signature, 0)
      signatureWithType[signature.length] = SIGNING_SERIALIZATION_TYPE

      input.unlockingBytecode = new Uint8Array([
        ...encodeDataPush(signatureWithType),
        ...encodeDataPush(publicKey),
      ])
    })
  } finally {
    // Best-effort wipe of the temporary signing key. The derived node is
    // local to this call; the master xpriv is never copied into the database.
    privateKey.fill(0)
  }

  return {
    rawTransactionHex: binToHex(encodeTransactionBch(transaction)),
    feeSats,
    inputSats,
    selectedUtxos: selected,
  }
}

export type WithdrawalResult = {
  id: string
  txid: string
  amountSats: bigint
  feeSats: bigint
}

/**
 * Reserves the balance, broadcasts a signed transaction, and records the
 * withdrawal. The reservation uses a conditional decrement so concurrent
 * requests cannot overdraw the account.
 */
export async function withdrawToLinkedWallet(params: {
  userId: string
  amountSats: bigint
  requestedAddress?: string
}): Promise<WithdrawalResult> {
  const { userId, amountSats } = params
  if (amountSats < MIN_WITHDRAWAL_SATS) {
    throw new WithdrawalError(`Minimum withdrawal is ${MIN_WITHDRAWAL_SATS} sats`)
  }

  const [user, wallet] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.platformWallet.findUnique({ where: { userId } }),
  ])

  if (!user) throw new WithdrawalError('Not signed in', 401)
  if (!wallet) throw new WithdrawalError('Platform wallet not found', 404)
  if (!user.bchAddress) {
    throw new WithdrawalError('Connect a payout wallet before withdrawing', 409)
  }

  const payoutAddress = normalizeAddress(user.bchAddress)
  if (params.requestedAddress) {
    const requested = normalizeAddress(params.requestedAddress)
    if (requested !== payoutAddress) {
      throw new WithdrawalError('Withdrawals can only be sent to your linked wallet', 403)
    }
  }

  const utxos = await getAddressUtxos(wallet.address).catch((error: unknown) => {
    throw new WithdrawalError(
      `Unable to load platform wallet UTXOs: ${error instanceof Error ? error.message : String(error)}`,
      502,
    )
  })

  const built = await buildSignedWithdrawal({
    platformAddress: wallet.address,
    derivationIndex: wallet.derivationIndex,
    toAddress: payoutAddress,
    amountSats,
    utxos,
  })
  const total = amountSats + built.feeSats

  const withdrawal = await prisma.$transaction(async (tx) => {
    const reserved = await tx.user.updateMany({
      where: { id: userId, balanceSats: { gte: total } },
      data: { balanceSats: { decrement: total } },
    })
    if (reserved.count !== 1) {
      throw new WithdrawalError('Insufficient balance', 409)
    }

    return tx.withdrawal.create({
      data: {
        userId,
        toAddress: payoutAddress,
        amountSats,
        feeSats: built.feeSats,
        status: 'PENDING',
      },
    })
  })

  let txid: string
  try {
    txid = await broadcastTransaction(built.rawTransactionHex)
  } catch (error) {
    // Broadcast never reached the network: restore the reserved balance and
    // mark the attempt as failed.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balanceSats: { increment: total } },
      })
      await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        },
      })
    })

    throw new WithdrawalError(
      `Broadcast failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
    )
  }

  // The transaction is now on the network. Never refund the reservation from
  // here on: the funds have left the platform wallet even if recording fails.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const broadcast = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'BROADCAST', txid },
      })

      const account = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { balanceSats: true },
      })

      await tx.ledgerEntry.create({
        data: {
          userId,
          kind: 'WITHDRAWAL',
          amountSats: -(amountSats + built.feeSats),
          balanceAfterSats: account.balanceSats,
          reference: `withdrawal:${withdrawal.id}`,
          metadata: { txid, feeSats: built.feeSats.toString() },
        },
      })

      return broadcast
    })

    return {
      id: updated.id,
      txid,
      amountSats: updated.amountSats,
      feeSats: updated.feeSats,
    }
  } catch (error) {
    await prisma.withdrawal
      .update({
        where: { id: withdrawal.id },
        data: {
          status: 'BROADCAST',
          txid,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .catch(() => undefined)

    throw new WithdrawalError(
      `Transaction ${txid} was broadcast but could not be recorded. Contact support.`,
      500,
    )
  }
}

export { MIN_WITHDRAWAL_SATS }
