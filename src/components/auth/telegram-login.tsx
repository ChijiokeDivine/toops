'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type TelegramAuthUser = Record<string, unknown>

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthUser) => void
  }
}

type TelegramLoginProps = {
  botUsername?: string
  onSuccess?: () => void
}

export function TelegramLogin({ botUsername, onSuccess }: TelegramLoginProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!botUsername) return
    const container = containerRef.current
    if (!container) return

    const handleAuth = async (user: TelegramAuthUser) => {
      setPending(true)
      setError(null)

      try {
        const response = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'Telegram sign-in failed.')
        }

        router.refresh()
        onSuccess?.()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Telegram sign-in failed.')
      } finally {
        setPending(false)
      }
    }

    window.onTelegramAuth = handleAuth
    container.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
      delete window.onTelegramAuth
    }
  }, [botUsername, onSuccess, router])

  if (!botUsername) {
    return (
      <p className="rounded-lg border border-[#ffdf1a]/25 bg-[#ffd60a]/10 p-3 text-sm text-[var(--t-gold)]">
        Telegram sign-in needs <code className="text-white">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>{' '}
        and a bot token. See the README for setup.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="min-h-[44px] flex align-center justify-center" />
      {pending && <p className="text-sm text-[var(--t-muted)]">Verifying Telegram…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-[var(--t-muted)]">
        The Telegram widget only works on a domain configured with @BotFather.
      </p>
    </div>
  )
}
