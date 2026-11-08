import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { formatPusdUnits, satsToPusdUnits } from '@/lib/pusd'
import { getParyonApiUrl, getPusdRate, getPusdTokenId } from '@/lib/pusd-server'
import {
  getMinimumWithdrawalPusd,
  getWithdrawalFeePusd,
  getWithdrawalFeeSats,
} from '@/lib/wallet/withdrawals'
import { getPlatformTokenAddress } from '@/lib/wallet/platform-wallet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const [user, deposits, withdrawals, rate] = await Promise.all([
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
    getPusdRate(),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const platform = user.platformWallet
  const tokenAddress = platform ? safeTokenAddress(platform.address) : null

  return NextResponse.json({
    balancePusd: formatPusdUnits(user.balancePusd),
    balanceSats: user.balanceSats.toString(),
    pusdTokenId: getPusdTokenId(),
    satsPerPusd: rate.satsPerPusd.toString(),
    bchUsdPrice: rate.bchUsdPrice,
    rateSource: rate.source,
    paryonUrl: getParyonApiUrl(),
    depositAddress: platform?.address ?? null,
    depositTokenAddress: tokenAddress,
    withdrawalFeePusd: formatPusdUnits(getWithdrawalFeePusd(rate)),
    withdrawalFeeSats: getWithdrawalFeeSats().toString(),
    minimumWithdrawalPusd: formatPusdUnits(getMinimumWithdrawalPusd()),
    payoutAssets: ['PUSD', 'BCH'],
    connectedAddress: user.bchAddress,
    platformWallet: platform
      ? {
          address: platform.address,
          tokenAddress,
          derivationIndex: platform.derivationIndex,
          network: platform.network,
        }
      : null,
    deposits: deposits.map((deposit) => {
      const amountPusd =
        deposit.amountPusd > 0n
          ? deposit.amountPusd
          : satsToPusdUnits(deposit.amountSats, rate.satsPerPusd)

      return {
        id: deposit.id,
        txid: deposit.txid,
        vout: deposit.vout,
        status: deposit.status,
        height: deposit.height,
        createdAt: deposit.createdAt,
        asset: deposit.amountSats > 0n ? 'BCH' : 'PUSD',
        amountPusd: formatPusdUnits(amountPusd),
        amountSats: deposit.amountSats.toString(),
        swapTxid: deposit.swapTxid,
        swapError: deposit.swapError,
      }
    }),
    withdrawals: withdrawals.map((withdrawal) => {
      const amountPusd =
        withdrawal.amountPusd > 0n
          ? withdrawal.amountPusd
          : satsToPusdUnits(withdrawal.amountSats, rate.satsPerPusd)
      const feePusd =
        withdrawal.feePusd > 0n
          ? withdrawal.feePusd
          : satsToPusdUnits(withdrawal.feeSats, rate.satsPerPusd)

      return {
        id: withdrawal.id,
        toAddress: withdrawal.toAddress,
        payoutAsset: withdrawal.payoutAsset,
        status: withdrawal.status,
        txid: withdrawal.txid,
        error: withdrawal.error,
        createdAt: withdrawal.createdAt,
        amountPusd: formatPusdUnits(amountPusd),
        feePusd: formatPusdUnits(feePusd),
        amountSats: withdrawal.amountSats.toString(),
        feeSats: withdrawal.feeSats.toString(),
      }
    }),
  })
}

function safeTokenAddress(address: string): string | null {
  try {
    return getPlatformTokenAddress(address)
  } catch {
    return null
  }
}
