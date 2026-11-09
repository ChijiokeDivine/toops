/** PUSD amounts are already formatted decimal strings (e.g. "19.80"). */
export function usd(amount: string): string {
  return `$${amount}`
}

export function shortHash(hash: string, head = 10, tail = 6): string {
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function formatCountdown(ms: number): string {
  return Math.max(0, Math.ceil(ms / 1_000)).toString()
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
