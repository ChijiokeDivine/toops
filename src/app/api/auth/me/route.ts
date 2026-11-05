import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const { user } = session
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      telegramUsername: user.telegramUsername,
      bchAddress: user.bchAddress,
      platformWalletAddress: user.platformWallet?.address ?? null,
    },
  })
}
