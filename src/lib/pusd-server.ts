import 'server-only'

import { getBchNetwork } from './bch/network'
import { PUSD_DECIMALS } from './pusd'

/**
 * ParyonUSD (PUSD) is a CashToken. The chipnet deployment (`chipnet-16`) and
 * mainnet deployment (`mainnet-v1`) use different category IDs.
 */
export const CHIPNET_PUSD_TOKEN_ID =
  'dfe50223c8d5cba8dcef8dff6d92b61deb88a8ba44947367f2b746487b56039b'
export const MAINNET_PUSD_TOKEN_ID =
  '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544'

const DEFAULT_PARYON_API_URL: Record<'chipnet' | 'mainnet', string> = {
  chipnet: 'https://chipnet-16.paryonusd.com',
  mainnet: 'https://mainnet-v1.paryonusd.com',
}

const RATE_TTL_MS = 60_000
const FALLBACK_BCH_USD_PRICE = 300

export function getPusdTokenId(): string {
  const configured = process.env.PUSD_TOKEN_ID?.trim()
  if (configured && /^[0-9a-fA-F]{64}$/.test(configured)) return configured.toLowerCase()
  return getBchNetwork() === 'mainnet' ? MAINNET_PUSD_TOKEN_ID : CHIPNET_PUSD_TOKEN_ID
}

export function getPusdDecimals(): number {
  const configured = Number(process.env.PUSD_DECIMALS)
  return Number.isInteger(configured) && configured >= 0 ? configured : PUSD_DECIMALS
}

/** Satoshis that must accompany a token output (CashTokens dust rule). */
export function getPusdDustSats(): bigint {
  const configured = Number(process.env.PUSD_DUST_SATS)
  return BigInt(Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 1000)
}

export function getParyonApiUrl(): string {
  return process.env.PARYON_API_URL?.trim() || DEFAULT_PARYON_API_URL[getBchNetwork()]
}

export type PusdRate = {
  /** BCH price in USD used for the peg. */
  bchUsdPrice: number
  /** Satoshis equal to one whole PUSD. */
  satsPerPusd: bigint
  /** Where the price came from (`paryon`, `env`, or `fallback`). */
  source: 'paryon' | 'env' | 'fallback'
}

let cachedRate: { value: PusdRate; at: number } | null = null

function rateFromPrice(bchUsdPrice: number, source: PusdRate['source']): PusdRate | null {
  if (!Number.isFinite(bchUsdPrice) || bchUsdPrice <= 0) return null
  return {
    bchUsdPrice,
    satsPerPusd: BigInt(Math.max(1, Math.round(100_000_000 / bchUsdPrice))),
    source,
  }
}

/**
 * Resolves the BCH/USD price Paryon uses for its oracle. The first successful
 * lookup is cached briefly so a page render that needs the rate in several
 * places only performs one HTTP request.
 */
export async function getPusdRate(): Promise<PusdRate> {
  if (cachedRate && Date.now() - cachedRate.at < RATE_TTL_MS) return cachedRate.value

  try {
    const response = await fetch(getParyonApiUrl(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (response.ok) {
      const data = (await response.json()) as {
        bchUsdPrice?: number | null
        oracleBchUsdPrice?: number | null
      }
      const price = data.bchUsdPrice ?? data.oracleBchUsdPrice
      const fromParyon = rateFromPrice(Number(price), 'paryon')
      if (fromParyon) {
        cachedRate = { value: fromParyon, at: Date.now() }
        return fromParyon
      }
    }
  } catch {
    // Fall through to the environment/fallback price.
  }

  const fromEnv = rateFromPrice(Number(process.env.BCH_USD_PRICE), 'env')
  if (fromEnv) {
    cachedRate = { value: fromEnv, at: Date.now() }
    return fromEnv
  }

  const fallback = rateFromPrice(FALLBACK_BCH_USD_PRICE, 'fallback')
  if (!fallback) throw new Error('Unable to determine a BCH/USD price')
  cachedRate = { value: fallback, at: Date.now() }
  return fallback
}

/** Testing helper: forget the cached oracle rate. */
export function clearPusdRateCache(): void {
  cachedRate = null
}
