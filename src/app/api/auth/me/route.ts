import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { formatPusdUnits, satsToPusdUnits } from '@/lib/pusd'
import { getPusdSatsPerPusd } from '@/lib/pusd-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const { user } = session
  const satsPerPusd = getPusdSatsPerPusd()
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      telegramUsername: user.telegramUsername,
      bchAddress: user.bchAddress,
      balanceSats: user.balanceSats.toString(),
      balancePusd: formatPusdUnits(satsToPusdUnits(user.balanceSats, satsPerPusd)),
      satsPerPusd: satsPerPusd.toString(),
      platformWalletAddress: user.platformWallet?.address ?? null,
      platformWalletIndex: user.platformWallet?.derivationIndex ?? null,
    },
  })
}
