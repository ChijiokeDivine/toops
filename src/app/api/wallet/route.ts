import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

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

  return NextResponse.json({
    balanceSats: user.balanceSats.toString(),
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
    })),
    withdrawals: withdrawals.map((withdrawal) => ({
      ...withdrawal,
      amountSats: withdrawal.amountSats.toString(),
      feeSats: withdrawal.feeSats.toString(),
    })),
  })
}
