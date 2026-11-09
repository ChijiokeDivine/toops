import { NextResponse } from 'next/server'
import { cancelMatchAsPlayer } from '@/lib/dual/engine'
import { dualErrorResponse, readMatchId, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await cancelMatchAsPlayer(matchId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
