import { NextResponse } from 'next/server'
import { normalizeCashAddress } from '@/lib/bch/address'
import { verifyBchMessageSignature } from '@/lib/bch/message'
import { ensureBchUser } from '@/lib/auth/users'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { address: rawAddress, nonce, message, signature } = body as Record<string, unknown>

  if (
    typeof rawAddress !== 'string' ||
    typeof nonce !== 'string' ||
    typeof message !== 'string' ||
    typeof signature !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing signature payload.' }, { status: 400 })
  }

  const address = normalizeCashAddress(rawAddress)
  if (!address) {
    return NextResponse.json({ error: 'Invalid wallet address.' }, { status: 400 })
  }

  const challenge = await prisma.authChallenge.findUnique({ where: { nonce } })
  if (!challenge) {
    return NextResponse.json({ error: 'Unknown or expired challenge.' }, { status: 401 })
  }

  if (challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Challenge has expired.' }, { status: 401 })
  }

  if (challenge.address !== address || challenge.message !== message) {
    return NextResponse.json({ error: 'Challenge does not match this request.' }, { status: 401 })
  }

  const valid = await verifyBchMessageSignature({ address, message, signature })
  if (!valid) {
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 401 })
  }

  const consumed = await prisma.authChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  if (consumed.count !== 1) {
    return NextResponse.json({ error: 'Challenge was already used.' }, { status: 401 })
  }

  const user = await ensureBchUser(address)
  const { token, expiresAt } = await createSession(user.id)

  const response = NextResponse.json({ ok: true, userId: user.id, address })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  return response
}
