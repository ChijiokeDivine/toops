const STORAGE_KEY = 'toops.sound.muted'
const CHANGE_EVENT = 'toops:sound'

export function getSoundMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Storage can be blocked; the event still updates the current tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeSoundMuted(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}
