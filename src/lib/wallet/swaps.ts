import 'server-only'

import { getCauldronPools, prepareBuyTokens, prepareSellTokens } from '@mr-zwets/cauldron-swap-sdk'
import { ElectrumNetworkProvider } from 'cashscript'
import type { CauldronActivePool, CauldronNetwork } from '@mr-zwets/cauldron-swap-sdk'
import { satsToPusdUnits } from '@/lib/pusd'
import { getBchNetwork } from '@/lib/bch/network'
import { getPusdRate, getPusdTokenId } from '@/lib/pusd-server'
import { getPlatformTokenAddress, derivePlatformPrivateKey } from './platform-wallet'

const FEE_RATE_SATS_PER_BYTE = 1.2
const SWAP_FEE_BUFFER_SATS = 3_000n

export class SwapError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
    this.name = 'SwapError'
  }
}

export type BuyPusdResult = {
  txid: string
  pusdReceived: bigint
  satsSpent: bigint
}

export type SellPusdResult = {
  txid: string
  satsReceived: bigint
}

function network(): CauldronNetwork {
  return getBchNetwork()
}

/**
 * The SDK ships its own cashscript copy; the provider is structurally
 * compatible, so keep the cast at this single boundary.
 */
function provider(): ConstructorParameters<typeof ElectrumNetworkProvider>[0] {
  return network()
}

async function poolsFor(tokenId: string): Promise<CauldronActivePool[]> {
  const pools = await getCauldronPools(tokenId, network())
  if (!pools || pools.length === 0) {
    throw new SwapError(`No Cauldron liquidity for token ${tokenId} on ${network()}`)
  }
  return pools
}

/**
 * Swaps BCH held at the platform address into PUSD. The amount bought is sized
 * from the Paryon oracle with a small buffer, so the swap cannot spend more
 * than the deposit that triggered it.
 */
export async function swapBchToPusd(params: {
  platformAddress: string
  derivationIndex: number
  bchSats: bigint
  /** Restrict the swap to one deposit outpoint instead of the whole wallet. */
  utxo?: { txid: string; vout: number; satoshis: bigint }
}): Promise<BuyPusdResult> {
  const { platformAddress, derivationIndex, bchSats, utxo } = params
  if (bchSats <= SWAP_FEE_BUFFER_SATS) {
    throw new SwapError('Deposit is too small to swap', 400)
  }

  const tokenId = getPusdTokenId()
  const tokenAddress = getPlatformTokenAddress(platformAddress)
  const rate = await getPusdRate()
  const pools = await poolsFor(tokenId)
  const privateKey = derivePlatformPrivateKey(derivationIndex)

  const budget = bchSats - SWAP_FEE_BUFFER_SATS
  let amountToBuy = satsToPusdUnits((budget * 98n) / 100n, rate.satsPerPusd)
  if (amountToBuy <= 0n) throw new SwapError('Deposit is too small to swap', 400)

  const electrum = new ElectrumNetworkProvider(provider())
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const prepared = await prepareBuyTokens(
          pools,
          amountToBuy,
          tokenAddress,
          privateKey,
          electrum as never,
          utxo ? [utxo] : undefined,
          FEE_RATE_SATS_PER_BYTE,
        )

        // Leave room for the miner fee and the token output dust.
        if (prepared.totalSatsCost + SWAP_FEE_BUFFER_SATS > bchSats) {
          amountToBuy = (amountToBuy * budget) / (prepared.totalSatsCost + SWAP_FEE_BUFFER_SATS)
          if (amountToBuy <= 0n) throw new SwapError('Deposit is too small to swap', 400)
          continue
        }

        const transaction = await prepared.transactionBuilder.send()
        return {
          txid: transaction.txid,
          pusdReceived: amountToBuy,
          satsSpent: prepared.totalSatsCost,
        }
      } catch (error) {
        if (attempt === 2) {
          throw new SwapError(
            `Unable to swap BCH to PUSD: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        amountToBuy = (amountToBuy * 90n) / 100n
        if (amountToBuy <= 0n) throw new SwapError('Deposit is too small to swap', 400)
      }
    }
  } finally {
    privateKey.fill(0)
  }

  throw new SwapError('Unable to swap BCH to PUSD')
}

/**
 * Swaps PUSD held at the platform address into BCH. Used for BCH payouts when
 * the platform's BCH reserve cannot cover the withdrawal.
 */
export async function swapPusdToBch(params: {
  platformAddress: string
  derivationIndex: number
  amountPusd: bigint
}): Promise<SellPusdResult> {
  const { platformAddress, derivationIndex, amountPusd } = params
  if (amountPusd <= 0n) throw new SwapError('Swap amount must be positive', 400)

  const tokenId = getPusdTokenId()
  const tokenAddress = getPlatformTokenAddress(platformAddress)
  const pools = await poolsFor(tokenId)
  const privateKey = derivePlatformPrivateKey(derivationIndex)

  const electrum = new ElectrumNetworkProvider(provider())
  try {
    const prepared = await prepareSellTokens(
      pools,
      amountPusd,
      tokenAddress,
      privateKey,
      electrum as never,
      undefined,
      FEE_RATE_SATS_PER_BYTE,
    )
    const transaction = await prepared.transactionBuilder.send()
    return { txid: transaction.txid, satsReceived: prepared.totalSatsReceived }
  } catch (error) {
    throw new SwapError(
      `Unable to swap PUSD to BCH: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    privateKey.fill(0)
  }
}

export { FEE_RATE_SATS_PER_BYTE }
