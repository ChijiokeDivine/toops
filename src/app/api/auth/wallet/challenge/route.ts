import { NextResponse } from 'next/server'
import { issueWalletChallenge, WalletChallengeError } from '@/lib/auth/wallet-challenge'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const address = body && typeof body.address === 'string' ? body.address : null

  if (!address) {
    return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 })
  }

  try {
    const challenge = await issueWalletChallenge(address)
    return NextResponse.json({
      address: challenge.address,
      nonce: challenge.nonce,
      message: challenge.message,
      transaction: challenge.transaction,
      sourceOutputs: challenge.sourceOutputs,
      expiresAt: challenge.expiresAt,
    })
  } catch (error) {
    if (error instanceof WalletChallengeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('wallet challenge failed', error)
    return NextResponse.json({ error: 'Unable to create a wallet challenge.' }, { status: 500 })
  }
}
