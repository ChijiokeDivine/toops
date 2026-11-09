import { NextResponse } from 'next/server'
import { disputeMatch } from '@/lib/dual/engine'
import { DualError } from '@/lib/dual/engine'
import { dualErrorResponse, readMatchId, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    const reason =
      body && typeof body === 'object' && 'reason' in body
        ? (body as { reason?: unknown }).reason
        : ''
    if (typeof reason !== 'string') {
      throw new DualError('Describe the problem in a few words.', 400, 'REASON_REQUIRED')
    }
    const result = await disputeMatch(matchId, userId, reason)
    return NextResponse.json({ ok: true, cancelled: result.cancelled })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
