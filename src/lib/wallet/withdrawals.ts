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
import { normalizeCashAddress, toTokenAwareAddress } from '@/lib/bch/address'
import {
  formatPusdUnits,
  parsePayoutAsset,
  pusdUnitsToSats,
  satsToPusdUnitsCeil,
  type PayoutAsset,
} from '@/lib/pusd'
import { getPusdDustSats, getPusdTokenId, getPusdRate, type PusdRate } from '@/lib/pusd-server'
import { derivePlatformPrivateKey } from './platform-wallet'

const DUST_THRESHOLD_SATS = 546n
const MIN_WITHDRAWAL_SATS = 1_000n
const SIGNING_SERIALIZATION_TYPE = 0x41 // SIGHASH_ALL | SIGHASH_FORKID
const TOKEN_PREFIX_OVERHEAD_BYTES = 41

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

export function getWithdrawalFeePusd(rate: PusdRate): bigint {
  return satsToPusdUnitsCeil(getWithdrawalFeeSats(), rate.satsPerPusd)
}

export function getMinimumWithdrawalPusd(): bigint {
  const configured = Number(process.env.MIN_WITHDRAWAL_PUSD ?? '100')
  const units = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 100
  return BigInt(units)
}

function p2pkhLockingBytecode(address: string): Uint8Array {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') {
    throw new WithdrawalError(`Invalid address: ${decoded}`)
  }
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
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

function tokenAmountBytes(amount: bigint): number {
  if (amount < 0xfdn) return 1
  if (amount <= 0xffffn) return 3
  if (amount <= 0xffffffffn) return 5
  return 9
}

function estimateTokenTransactionFee(inputCount: number, tokenOutputCount: number): bigint {
  const tokenBytes = tokenOutputCount * (34 + TOKEN_PREFIX_OVERHEAD_BYTES)
  const size = 10 + inputCount * 148 + tokenBytes + 34
  return BigInt(Math.ceil(size * 1) + 100)
}

export type BuiltWithdrawal = {
  rawTransactionHex: string
  feeSats: bigint
  inputSats: bigint
  selectedUtxos: ElectrumUtxo[]
}

/**
 * Builds and signs a P2PKH BCH withdrawal from the user's HD platform address.
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
    throw new WithdrawalError(`Minimum BCH withdrawal is ${MIN_WITHDRAWAL_SATS} sats`)
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

  const spendable = utxos.filter((utxo) => !utxo.token)
  if (spendable.length === 0) {
    throw new WithdrawalError('The platform wallet has no spendable BCH outputs yet', 409)
  }

  const sorted = [...spendable].sort((a, b) => b.value - a.value)
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

  const sourceOutputs: Output[] = selected.map((utxo) => ({
    lockingBytecode: platformLocking,
    valueSatoshis: BigInt(utxo.value),
  }))

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

  await signP2pkhInputs({
    transaction,
    sourceOutputs,
    derivationIndex,
  })

  return {
    rawTransactionHex: binToHex(encodeTransactionBch(transaction)),
    feeSats,
    inputSats,
    selectedUtxos: selected,
  }
}

type TokenOutput = {
  lockingBytecode: Uint8Array
  valueSatoshis: bigint
  token: { category: Uint8Array; amount: bigint }
}

export type BuiltTokenWithdrawal = BuiltWithdrawal & {
  tokenInputAmount: bigint
  tokenChangeAmount: bigint
}

/**
 * Builds and signs a PUSD CashToken withdrawal. Token outputs need BCH dust, so
 * the builder tops up the fee/dust from non-token UTXOs at the same address.
 */
export async function buildSignedTokenWithdrawal(params: {
  platformAddress: string
  derivationIndex: number
  toAddress: string
  amountPusd: bigint
  tokenId: string
  utxos?: ElectrumUtxo[]
}): Promise<BuiltTokenWithdrawal> {
  const { platformAddress, derivationIndex, toAddress, amountPusd, tokenId } = params
  if (amountPusd <= 0n) throw new WithdrawalError('Withdrawal amount must be positive')

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

  const tokenUtxos = utxos
    .filter(
      (utxo) =>
        utxo.token &&
        !utxo.token.nft &&
        utxo.token.category.toLowerCase() === tokenId.toLowerCase(),
    )
    .sort((a, b) => Number((b.token?.amount ?? 0n) - (a.token?.amount ?? 0n)))

  const selected: ElectrumUtxo[] = []
  let tokenInputAmount = 0n
  for (const utxo of tokenUtxos) {
    selected.push(utxo)
    tokenInputAmount += utxo.token?.amount ?? 0n
    if (tokenInputAmount >= amountPusd) break
  }
  if (tokenInputAmount < amountPusd) {
    throw new WithdrawalError('The platform wallet does not have enough PUSD', 409)
  }

  const tokenChangeAmount = tokenInputAmount - amountPusd
  const tokenOutputCount = tokenChangeAmount > 0n ? 2 : 1
  const dust = getPusdDustSats()

  let inputSats = selected.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n)
  let feeSats = estimateTokenTransactionFee(selected.length, tokenOutputCount)
  const bchUtxos = utxos
    .filter((utxo) => !utxo.token)
    .sort((a, b) => b.value - a.value)

  // Top up dust + miner fee from plain BCH outputs at the same address.
  for (const utxo of bchUtxos) {
    if (inputSats >= BigInt(tokenOutputCount) * dust + feeSats) break
    selected.push(utxo)
    inputSats += BigInt(utxo.value)
    feeSats = estimateTokenTransactionFee(selected.length, tokenOutputCount)
  }

  const dustTotal = BigInt(tokenOutputCount) * dust
  if (inputSats < dustTotal + feeSats) {
    throw new WithdrawalError('The platform wallet has no BCH for token dust and fees', 409)
  }

  let changeSats = inputSats - dustTotal - feeSats
  if (changeSats > 0n && changeSats < DUST_THRESHOLD_SATS) {
    feeSats += changeSats
    changeSats = 0n
  }

  const category = hexToBin(tokenId)
  const outputs: Output[] = [
    {
      lockingBytecode: destinationLocking,
      valueSatoshis: dust,
      token: { category, amount: amountPusd },
    },
  ]
  if (tokenChangeAmount > 0n) {
    outputs.push({
      lockingBytecode: platformLocking,
      valueSatoshis: dust,
      token: { category, amount: tokenChangeAmount },
    })
  }
  if (changeSats >= DUST_THRESHOLD_SATS) {
    outputs.push({ lockingBytecode: platformLocking, valueSatoshis: changeSats })
  }

  const sourceOutputs: Output[] = selected.map((utxo) => ({
    lockingBytecode: platformLocking,
    valueSatoshis: BigInt(utxo.value),
    token: utxo.token
      ? {
          category: hexToBin(utxo.token.category),
          amount: utxo.token.amount,
        }
      : undefined,
  }))

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

  await signP2pkhInputs({ transaction, sourceOutputs, derivationIndex })

  return {
    rawTransactionHex: binToHex(encodeTransactionBch(transaction)),
    feeSats,
    inputSats,
    selectedUtxos: selected,
    tokenInputAmount,
    tokenChangeAmount,
  }
}

async function signP2pkhInputs(params: {
  transaction: TransactionCommon
  sourceOutputs: Output[]
  derivationIndex: number
}): Promise<void> {
  const { transaction, sourceOutputs, derivationIndex } = params
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
    // Best-effort wipe of the temporary signing key.
    privateKey.fill(0)
  }
}

export type WithdrawalResult = {
  id: string
  txid: string
  payoutAsset: PayoutAsset
  amountPusd: bigint
  feePusd: bigint
  amountSats: bigint
  feeSats: bigint
}

export type WithdrawalRequest = {
  userId: string
  amountPusd: bigint
  payoutAsset: PayoutAsset
  requestedAddress?: string
}

/**
 * Reserves the PUSD balance, builds/broadcasts the payout, and records the
 * withdrawal. The reservation uses a conditional decrement so concurrent
 * requests cannot overdraw the account.
 */
export async function withdraw(params: WithdrawalRequest): Promise<WithdrawalResult> {
  const { userId, amountPusd } = params
  const payoutAsset = parsePayoutAsset(params.payoutAsset)
  if (!payoutAsset) throw new WithdrawalError('Choose a valid payout asset')

  const minimum = getMinimumWithdrawalPusd()
  if (amountPusd < minimum) {
    throw new WithdrawalError(`Minimum withdrawal is ${formatPusdUnits(minimum)} PUSD`)
  }

  const [user, wallet, rate] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.platformWallet.findUnique({ where: { userId } }),
    getPusdRate(),
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

  const feePusd = getWithdrawalFeePusd(rate)
  const totalPusd = amountPusd + feePusd
  const tokenId = getPusdTokenId()

  const withdrawal = await prisma.$transaction(async (tx) => {
    const reserved = await tx.user.updateMany({
      where: { id: userId, balancePusd: { gte: totalPusd } },
      data: { balancePusd: { decrement: totalPusd } },
    })
    if (reserved.count !== 1) {
      throw new WithdrawalError('Insufficient balance', 409)
    }

    return tx.withdrawal.create({
      data: {
        userId,
        toAddress: payoutAddress,
        payoutAsset,
        amountPusd,
        feePusd,
        amountSats: 0n,
        feeSats: 0n,
        status: 'PENDING',
      },
    })
  })

  try {
    if (payoutAsset === 'PUSD') {
      const built = await buildSignedTokenWithdrawal({
        platformAddress: wallet.address,
        derivationIndex: wallet.derivationIndex,
        toAddress: toTokenAwareAddress(payoutAddress),
        amountPusd,
        tokenId,
      })
      const txid = await broadcastTransaction(built.rawTransactionHex)
      return await finalizeWithdrawal({
        withdrawalId: withdrawal.id,
        userId,
        payoutAsset,
        txid,
        amountPusd,
        feePusd,
        amountSats: 0n,
        feeSats: built.feeSats,
        totalPusd,
      })
    }

    const amountSats = pusdUnitsToSats(amountPusd, rate.satsPerPusd)
    if (amountSats < MIN_WITHDRAWAL_SATS) {
      throw new WithdrawalError(`Minimum BCH withdrawal is ${MIN_WITHDRAWAL_SATS} sats`)
    }

    const built = await buildSignedWithdrawal({
      platformAddress: wallet.address,
      derivationIndex: wallet.derivationIndex,
      toAddress: payoutAddress,
      amountSats,
    })
    const txid = await broadcastTransaction(built.rawTransactionHex)
    return await finalizeWithdrawal({
      withdrawalId: withdrawal.id,
      userId,
      payoutAsset,
      txid,
      amountPusd,
      feePusd,
      amountSats,
      feeSats: built.feeSats,
      totalPusd,
    })
  } catch (error) {
    // Nothing reached the network: restore the reservation and mark the
    // attempt as failed.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balancePusd: { increment: totalPusd } },
      })
      await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        },
      })
    })

    if (error instanceof WithdrawalError) throw error
    throw new WithdrawalError(
      `Withdrawal failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
    )
  }
}

async function finalizeWithdrawal(params: {
  withdrawalId: string
  userId: string
  payoutAsset: PayoutAsset
  txid: string
  amountPusd: bigint
  feePusd: bigint
  amountSats: bigint
  feeSats: bigint
  totalPusd: bigint
}): Promise<WithdrawalResult> {
  const {
    withdrawalId,
    userId,
    payoutAsset,
    txid,
    amountPusd,
    feePusd,
    amountSats,
    feeSats,
    totalPusd,
  } = params

  // The transaction is now on the network. Never refund the reservation from
  // here on: the funds have left the platform wallet even if recording fails.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const broadcast = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'BROADCAST', txid, amountSats, feeSats },
      })

      const account = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { balancePusd: true },
      })

      await tx.ledgerEntry.create({
        data: {
          userId,
          kind: 'WITHDRAWAL',
          amountPusd: -totalPusd,
          balanceAfterPusd: account.balancePusd,
          reference: `withdrawal:${withdrawalId}`,
          metadata: {
            txid,
            payoutAsset,
            amountPusd: amountPusd.toString(),
            feePusd: feePusd.toString(),
            amountSats: amountSats.toString(),
            feeSats: feeSats.toString(),
          },
        },
      })

      return broadcast
    })

    return {
      id: updated.id,
      txid,
      payoutAsset,
      amountPusd: updated.amountPusd,
      feePusd: updated.feePusd,
      amountSats: updated.amountSats,
      feeSats: updated.feeSats,
    }
  } catch (error) {
    await prisma.withdrawal
      .update({
        where: { id: withdrawalId },
        data: {
          status: 'BROADCAST',
          txid,
          amountSats,
          feeSats,
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

// Backwards-compatible name for callers that only know the old BCH flow.
export { withdraw as withdrawToLinkedWallet }

export { MIN_WITHDRAWAL_SATS, tokenAmountBytes }
