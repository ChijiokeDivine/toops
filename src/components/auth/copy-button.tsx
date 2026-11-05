'use client'

import { useState } from 'react'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="rounded-md border border-[var(--t-border)] px-2 py-1 text-[11px] font-medium text-[var(--t-muted)] transition hover:border-white/20 hover:text-white"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
