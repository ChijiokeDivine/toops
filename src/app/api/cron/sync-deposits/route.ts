import { NextResponse } from 'next/server'
import { cleanupExpiredWalletChallenges } from '@/lib/auth/wallet-challenge'
import { syncAllDeposits } from '@/lib/wallet/deposits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const explicit = request.headers.get('x-cron-secret') ?? ''
  return bearer === secret || explicit === secret
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? '50')

  try {
    const result = await syncAllDeposits(limit)
    const expiredChallengesDeleted = await cleanupExpiredWalletChallenges().catch(
      (error: unknown) => {
        console.error('expired challenge cleanup failed', error)
        return null
      },
    )
    return NextResponse.json({
      ok: true,
      users: result.users,
      scannedUsers: result.scannedUsers,
      newDeposits: result.newDeposits,
      creditedSats: result.creditedSats.toString(),
      errors: result.errors,
      expiredChallengesDeleted,
    })
  } catch (error) {
    console.error('bulk deposit sync failed', error)
    return NextResponse.json({ error: 'Deposit sync failed.' }, { status: 500 })
  }
}
