import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'
import { getPusdRate } from '@/lib/pusd-server'
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
    const [result, user, rate] = await Promise.all([
      syncUserDeposits(session.userId),
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { balancePusd: true },
      }),
      getPusdRate(),
    ])

    return NextResponse.json({
      ok: true,
      newDeposits: result.newDeposits,
      creditedPusd: formatPusdUnits(result.creditedPusd),
      swappedDeposits: result.swappedDeposits,
      scannedTransactions: result.scannedTransactions,
      errors: result.errors,
      balancePusd: formatPusdUnits(user.balancePusd),
      satsPerPusd: rate.satsPerPusd.toString(),
      bchUsdPrice: rate.bchUsdPrice,
    })
  } catch (error) {
    console.error('deposit sync failed', error)
    return NextResponse.json(
      { error: 'Unable to scan the chipnet Electrum server right now.' },
      { status: 502 },
    )
  }
}
