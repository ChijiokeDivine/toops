import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { consumeWalletChallenge, WalletChallengeError } from '@/lib/auth/wallet-challenge'
import { linkBchAddress, WalletAlreadyLinkedError } from '@/lib/auth/users'

export const runtime = 'nodejs'

/** Links a verified wallet address to the signed-in account for payouts. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

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

    const user = await linkBchAddress(session.userId, verified.address)
    return NextResponse.json({ ok: true, address: user.bchAddress })
  } catch (error) {
    if (error instanceof WalletChallengeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof WalletAlreadyLinkedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('wallet link failed', error)
    return NextResponse.json({ error: 'Unable to link this wallet.' }, { status: 500 })
  }
}
