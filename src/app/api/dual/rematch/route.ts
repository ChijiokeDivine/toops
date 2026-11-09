import { NextResponse } from 'next/server'
import { declineRematch, requestRematch } from '@/lib/dual/engine'
import { DualError } from '@/lib/dual/engine'
import { dualErrorResponse, readMatchId, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    const action =
      body && typeof body === 'object' && 'action' in body
        ? (body as { action?: unknown }).action
        : 'request'

    if (action === 'decline') {
      await declineRematch(matchId, userId)
      return NextResponse.json({ ok: true, matchId: null })
    }
    if (action !== 'request') {
      throw new DualError('Unknown rematch action.', 400, 'INVALID_ACTION')
    }

    const result = await requestRematch(matchId, userId)
    return NextResponse.json({ ok: true, matchId: result.matchId })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
