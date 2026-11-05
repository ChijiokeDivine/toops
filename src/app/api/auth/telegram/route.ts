import { NextResponse } from 'next/server'
import { verifyTelegramAuth } from '@/lib/auth/telegram'
import { ensureTelegramUser } from '@/lib/auth/users'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { PlatformWalletConfigError, platformWalletErrorMessage } from '@/lib/wallet/platform-wallet'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'Telegram sign-in is not configured on this deployment.' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const payload = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  )

  const telegramUser = verifyTelegramAuth(payload)
  if (!telegramUser) {
    return NextResponse.json({ error: 'Invalid Telegram authorization.' }, { status: 401 })
  }

  let user
  try {
    user = await ensureTelegramUser(telegramUser)
  } catch (error) {
    if (error instanceof PlatformWalletConfigError) {
      return NextResponse.json({ error: platformWalletErrorMessage(error) }, { status: 503 })
    }
    console.error('telegram sign-in failed', error)
    return NextResponse.json({ error: 'Telegram sign-in failed.' }, { status: 500 })
  }

  const { token, expiresAt } = await createSession(user.id)

  const response = NextResponse.json({ ok: true, userId: user.id })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  return response
}
