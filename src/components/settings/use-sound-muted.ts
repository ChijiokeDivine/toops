'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { getSoundMuted, setSoundMuted, subscribeSoundMuted } from './sound-preference'

export function useSoundMuted() {
  const muted = useSyncExternalStore(subscribeSoundMuted, getSoundMuted, () => false)

  const toggle = useCallback(() => {
    const next = !getSoundMuted()
    setSoundMuted(next)
    return next
  }, [])

  return { muted, toggle }
}
