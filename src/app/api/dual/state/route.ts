import { NextResponse } from 'next/server'
import { getDualState } from '@/lib/dual/engine'
import { dualErrorResponse, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireUserId()
    const state = await getDualState(userId)
    return NextResponse.json(state)
  } catch (error) {
    return dualErrorResponse(error)
  }
}
