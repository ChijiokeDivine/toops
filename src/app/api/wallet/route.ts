import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { formatPusdUnits, satsToPusdUnits } from '@/lib/pusd'
import { getPusdSatsPerPusd } from '@/lib/pusd-server'
import { getWithdrawalFeeSats, MIN_WITHDRAWAL_SATS } from '@/lib/wallet/withdrawals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const [user, deposits, withdrawals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { platformWallet: true },
    }),
    prisma.deposit.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.withdrawal.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const satsPerPusd = getPusdSatsPerPusd()
  const feeSats = getWithdrawalFeeSats()

  return NextResponse.json({
    balanceSats: user.balanceSats.toString(),
    balancePusd: formatPusdUnits(satsToPusdUnits(user.balanceSats, satsPerPusd)),
    satsPerPusd: satsPerPusd.toString(),
    withdrawalFeeSats: feeSats.toString(),
    withdrawalFeePusd: formatPusdUnits(satsToPusdUnits(feeSats, satsPerPusd)),
    minimumWithdrawalPusd: formatPusdUnits(satsToPusdUnits(MIN_WITHDRAWAL_SATS, satsPerPusd)),
    connectedAddress: user.bchAddress,
    platformWallet: user.platformWallet
      ? {
          address: user.platformWallet.address,
          derivationIndex: user.platformWallet.derivationIndex,
          network: user.platformWallet.network,
        }
      : null,
    deposits: deposits.map((deposit) => ({
      ...deposit,
      amountSats: deposit.amountSats.toString(),
      amountPusd: formatPusdUnits(satsToPusdUnits(deposit.amountSats, satsPerPusd)),
    })),
    withdrawals: withdrawals.map((withdrawal) => ({
      ...withdrawal,
      amountSats: withdrawal.amountSats.toString(),
      feeSats: withdrawal.feeSats.toString(),
      amountPusd: formatPusdUnits(satsToPusdUnits(withdrawal.amountSats, satsPerPusd)),
      feePusd: formatPusdUnits(satsToPusdUnits(withdrawal.feeSats, satsPerPusd)),
    })),
  })
}
