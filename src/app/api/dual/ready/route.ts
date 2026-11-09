import { NextResponse } from 'next/server'
import { markReady } from '@/lib/dual/engine'
import { dualErrorResponse, readMatchId, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await markReady(matchId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
