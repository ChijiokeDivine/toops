import { NextResponse } from 'next/server'
import { getClientSeed, regenerateClientSeed } from '@/lib/dual/engine'
import { dualErrorResponse, requireUserId } from '@/lib/dual/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireUserId()
    const clientSeed = await getClientSeed(userId)
    return NextResponse.json({ clientSeed })
  } catch (error) {
    return dualErrorResponse(error)
  }
}

export async function POST() {
  try {
    const userId = await requireUserId()
    const clientSeed = await regenerateClientSeed(userId)
    return NextResponse.json({ ok: true, clientSeed })
  } catch (error) {
    return dualErrorResponse(error)
  }
}
