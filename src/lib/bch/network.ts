export type BchNetwork = 'chipnet' | 'mainnet'

export function getBchNetwork(): BchNetwork {
  return process.env.BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet'
}

export function getAddressPrefix(): 'bitcoincash' | 'bchtest' {
  return getBchNetwork() === 'mainnet' ? 'bitcoincash' : 'bchtest'
}
