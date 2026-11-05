'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setPending(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={pending}
      className="rounded-lg border border-[var(--t-border)] px-3 py-1.5 text-xs font-medium text-[var(--t-muted)] transition hover:border-white/20 hover:text-white disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
