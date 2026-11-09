import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { DualError } from './engine'

export async function requireUserId(): Promise<string> {
  const session = await getSession()
  if (!session) {
    throw new DualError('Sign in to play Dual Crash.', 401, 'UNAUTHENTICATED')
  }
  return session.userId
}

export function dualErrorResponse(error: unknown): NextResponse {
  if (error instanceof DualError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error('[dual] request failed', error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export function readMatchId(body: unknown): string {
  if (!body || typeof body !== 'object' || !('matchId' in body)) {
    throw new DualError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
  }
  const matchId = (body as { matchId?: unknown }).matchId
  if (typeof matchId !== 'string' || matchId.trim().length === 0) {
    throw new DualError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
  }
  return matchId.trim()
}
