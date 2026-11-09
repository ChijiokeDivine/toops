import { NextResponse } from 'next/server'
import { verifyMatch } from '@/lib/dual/engine'
import { DualError } from '@/lib/dual/engine'
import { dualErrorResponse } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const matchId = url.searchParams.get('matchId')?.trim()
    if (!matchId) {
      throw new DualError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
    }
    const roundParam = url.searchParams.get('round')
    const round = roundParam ? Number(roundParam) : undefined
    if (round != null && (!Number.isInteger(round) || round < 1)) {
      throw new DualError('Invalid round.', 400, 'INVALID_ROUND')
    }
    const verification = await verifyMatch(matchId, round)
    return NextResponse.json(verification)
  } catch (error) {
    return dualErrorResponse(error)
  }
}
