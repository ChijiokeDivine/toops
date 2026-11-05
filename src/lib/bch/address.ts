import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth'
import { getAddressPrefix } from './network'

/**
 * Accepts a cash address in any prefix (e.g. `bitcoincash:` or `bchtest:`)
 * and returns it in the canonical prefix for the configured network.
 * Message signing is only defined for P2PKH addresses.
 */
export function normalizeCashAddress(
  input: string,
  prefix: 'bitcoincash' | 'bchtest' = getAddressPrefix(),
): string | null {
  const decoded = decodeCashAddress(input.trim())
  if (typeof decoded === 'string') return null
  if (decoded.type !== 'p2pkh') return null

  const encoded = encodeCashAddress({
    prefix,
    type: decoded.type,
    payload: decoded.payload,
  })

  return typeof encoded === 'string' ? encoded : encoded.address
}
