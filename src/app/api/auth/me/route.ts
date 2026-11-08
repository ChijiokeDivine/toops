import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { formatPusdUnits } from '@/lib/pusd'
import { getPusdRate, getPusdTokenId } from '@/lib/pusd-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const { user } = session
  const rate = await getPusdRate()

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      telegramUsername: user.telegramUsername,
      bchAddress: user.bchAddress,
      balancePusd: formatPusdUnits(user.balancePusd),
      balanceSats: user.balanceSats.toString(),
      pusdTokenId: getPusdTokenId(),
      satsPerPusd: rate.satsPerPusd.toString(),
      bchUsdPrice: rate.bchUsdPrice,
      platformWalletAddress: user.platformWallet?.address ?? null,
      platformWalletIndex: user.platformWallet?.derivationIndex ?? null,
    },
  })
}
