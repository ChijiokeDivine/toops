import { NextResponse } from 'next/server'
import { heartbeatMatch } from '@/lib/dual/engine'
import { dualErrorResponse, readMatchId, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight presence ping. The full state poll already refreshes the
 * heartbeat, but it also loads the user, the match and the ledger view. On a
 * slow database link that request can outlive the disconnect grace window, so
 * the client also sends this single-update ping in parallel.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await heartbeatMatch(matchId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
