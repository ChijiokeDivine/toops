import { NextResponse } from 'next/server'
import { getHistory } from '@/lib/dual/engine'
import { dualErrorResponse, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const userId = await requireUserId()
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const matches = await getHistory(userId, Number.isFinite(limit) ? limit : 20)
    return NextResponse.json({ matches })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
