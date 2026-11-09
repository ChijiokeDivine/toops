import { NextResponse } from 'next/server'
import { advanceOpenMatches } from '@/lib/dual/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const explicit = request.headers.get('x-cron-secret') ?? ''
  return bearer === secret || explicit === secret
}

/**
 * Advances open Dual Crash matches and refunds expired queue tickets.
 * Safe to call frequently; every transition is idempotent.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const advanced = await advanceOpenMatches()
    return NextResponse.json({ ok: true, advanced })
  } catch (error) {
    console.error('dual cron failed', error)
    return NextResponse.json({ error: 'Dual maintenance failed.' }, { status: 500 })
  }
}
