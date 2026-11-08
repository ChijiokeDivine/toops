import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { claimDailyXp, getXpSummary, XpError } from '@/lib/xp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Sign in to claim XP.' }, { status: 401 })
  }

  try {
    await claimDailyXp(session.user.id)
    const summary = await getXpSummary(session.user.id)
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    if (error instanceof XpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('xp claim failed', error)
    return NextResponse.json({ error: 'Unable to claim XP right now.' }, { status: 500 })
  }
}
