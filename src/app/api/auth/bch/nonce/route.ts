import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { normalizeCashAddress } from '@/lib/bch/address'
import { createLoginMessage } from '@/lib/bch/message'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const CHALLENGE_TTL_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const rawAddress = body && typeof body.address === 'string' ? body.address : null

  if (!rawAddress) {
    return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 })
  }

  const address = normalizeCashAddress(rawAddress)
  if (!address) {
    return NextResponse.json(
      { error: 'Unsupported or invalid Bitcoin Cash address.' },
      { status: 400 },
    )
  }

  await prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } })

  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS)
  const message = createLoginMessage({ address, nonce, issuedAt })

  await prisma.authChallenge.create({
    data: { address, nonce, message, expiresAt },
  })

  return NextResponse.json({ address, nonce, message, expiresAt })
}
