import { NextResponse } from 'next/server'
import { consumeWalletChallenge, WalletChallengeError } from '@/lib/auth/wallet-challenge'
import { ensureBchUser } from '@/lib/auth/users'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { PlatformWalletConfigError, platformWalletErrorMessage } from '@/lib/wallet/platform-wallet'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { address, nonce, signedTransaction } = body as Record<string, unknown>
  if (
    typeof address !== 'string' ||
    typeof nonce !== 'string' ||
    typeof signedTransaction !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing signature payload.' }, { status: 400 })
  }

  try {
    const verified = await consumeWalletChallenge({
      rawAddress: address,
      nonce,
      signedTransaction,
    })

    const user = await ensureBchUser(verified.address)
    const { token, expiresAt } = await createSession(user.id)

    const response = NextResponse.json({
      ok: true,
      userId: user.id,
      address: verified.address,
    })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return response
  } catch (error) {
    if (error instanceof WalletChallengeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof PlatformWalletConfigError) {
      return NextResponse.json({ error: platformWalletErrorMessage(error) }, { status: 503 })
    }
    console.error('wallet verification failed', error)
    return NextResponse.json({ error: 'Wallet verification failed.' }, { status: 500 })
  }
}
