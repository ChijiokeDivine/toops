'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { subscribeSettings } from './settings-events'
import { useSoundMuted } from './use-sound-muted'

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const { muted, toggle } = useSoundMuted()

  useEffect(() => {
    return subscribeSettings(() => setOpen(true))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-[20px] border border-[var(--t-border)] bg-[var(--t-surface)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:max-w-sm sm:rounded-[20px]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="settings-dialog-title" className="text-lg font-semibold text-white">
            Settings
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--t-muted)] transition hover:bg-[var(--t-surface-2)] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg)]/60 px-3 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Sound</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label="Sound"
            onClick={toggle}
            className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${
              muted ? 'bg-[var(--t-surface-3)]' : 'bg-[var(--t-green)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                muted ? 'left-0.5' : 'left-[22px]'
              }`}
            />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
