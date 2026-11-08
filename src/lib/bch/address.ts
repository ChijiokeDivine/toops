import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth'
import { getAddressPrefix } from './network'

/**
 * Accepts a cash address in any prefix (e.g. `bitcoincash:` or `bchtest:`)
 * and returns it in the canonical prefix for the configured network.
 * Both plain P2PKH (type 0) and token-aware P2PKH (type 2) are accepted.
 */
export function normalizeCashAddress(
  input: string,
  prefix: 'bitcoincash' | 'bchtest' = getAddressPrefix(),
): string | null {
  const decoded = decodeCashAddress(input.trim())
  if (typeof decoded === 'string') return null
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') return null

  const encoded = encodeCashAddress({
    prefix,
    type: decoded.type,
    payload: decoded.payload,
  })

  return typeof encoded === 'string' ? encoded : encoded.address
}

/**
 * Re-encodes any P2PKH address as a token-aware address (type 2). The locking
 * bytecode is identical, but wallets that support CashTokens expect type 2 for
 * addresses that will receive tokens.
 */
export function toTokenAwareAddress(
  input: string,
  prefix: 'bitcoincash' | 'bchtest' = getAddressPrefix(),
): string {
  const decoded = decodeCashAddress(input.trim())
  if (typeof decoded === 'string') throw new Error(`Invalid address: ${decoded}`)
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Only P2PKH addresses can receive PUSD')
  }

  const encoded = encodeCashAddress({
    prefix,
    type: 'p2pkhWithTokens',
    payload: decoded.payload,
  })
  if (typeof encoded === 'string') throw new Error(`Unable to encode token address: ${encoded}`)
  return encoded.address
}

