import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { formatPusdUnits, satsToPusdUnits } from '@/lib/pusd'
import { getPusdSatsPerPusd } from '@/lib/pusd-server'
import { syncUserDeposits } from '@/lib/wallet/deposits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const wallet = await prisma.platformWallet.findUnique({
    where: { userId: session.userId },
    select: { id: true },
  })
  if (!wallet) {
    return NextResponse.json({ error: 'Platform wallet not found.' }, { status: 404 })
  }

  try {
    const result = await syncUserDeposits(session.userId)
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { balanceSats: true },
    })
    const satsPerPusd = getPusdSatsPerPusd()

    return NextResponse.json({
      ok: true,
      newDeposits: result.newDeposits,
      creditedSats: result.creditedSats.toString(),
      creditedPusd: formatPusdUnits(satsToPusdUnits(result.creditedSats, satsPerPusd)),
      scannedTransactions: result.scannedTransactions,
      balanceSats: user.balanceSats.toString(),
      balancePusd: formatPusdUnits(satsToPusdUnits(user.balanceSats, satsPerPusd)),
      satsPerPusd: satsPerPusd.toString(),
    })
  } catch (error) {
    console.error('deposit sync failed', error)
    return NextResponse.json(
      { error: 'Unable to scan the chipnet Electrum server right now.' },
      { status: 502 },
    )
  }
}
