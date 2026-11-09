import { NextResponse } from 'next/server'
import { joinQueue, leaveQueue } from '@/lib/dual/engine'
import { dualErrorResponse, requireUserId } from '@/lib/dual/http'
import { DualError } from '@/lib/dual/engine'
import { parsePusdInput } from '@/lib/pusd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const rawStake =
      body && typeof body === 'object' && 'stake' in body
        ? (body as { stake?: unknown }).stake
        : null
    const stakePusd = parsePusdInput(String(rawStake ?? ''))

    if (!stakePusd) {
      throw new DualError('Choose a valid stake amount.', 400, 'INVALID_STAKE')
    }

    const result = await joinQueue(userId, stakePusd)
    return NextResponse.json({ ok: true, matchId: result.matchId })
  } catch (error) {
    return dualErrorResponse(error)
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId()
    await leaveQueue(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
