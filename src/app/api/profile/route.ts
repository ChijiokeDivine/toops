import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,/i
const MAX_AVATAR_LENGTH = 400_000

type ProfilePatch = {
  displayName?: string
  email?: string | null
  avatarUrl?: string | null
}

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return invalid('Invalid request body.')

  const patch: ProfilePatch = {}

  if ('displayName' in body) {
    if (typeof body.displayName !== 'string') return invalid('Username must be text.')
    const displayName = body.displayName.trim().replace(/\s+/g, ' ')

    if (displayName.length < 2 || displayName.length > 24) {
      return invalid('Username must be between 2 and 24 characters.')
    }
    if (!USERNAME_PATTERN.test(displayName)) {
      return invalid('Use letters, numbers, spaces, dots, dashes, or underscores.')
    }

    patch.displayName = displayName
  }

  if ('email' in body) {
    if (body.email === null || body.email === '') {
      patch.email = null
    } else if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase()
      if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return invalid('Enter a valid email address.')
      }
      patch.email = email
    } else {
      return invalid('Email must be text.')
    }
  }

  if ('avatarUrl' in body) {
    if (body.avatarUrl === null || body.avatarUrl === '') {
      patch.avatarUrl = null
    } else if (
      typeof body.avatarUrl === 'string' &&
      body.avatarUrl.length <= MAX_AVATAR_LENGTH &&
      AVATAR_PATTERN.test(body.avatarUrl)
    ) {
      patch.avatarUrl = body.avatarUrl
    } else {
      return invalid('Avatar must be a PNG, JPG, GIF, or WebP image under 2 MB.')
    }
  }

  if (Object.keys(patch).length === 0) {
    return invalid('Nothing to update.')
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: patch,
      select: { displayName: true, email: true, avatarUrl: true },
    })

    return NextResponse.json({ ok: true, user })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'That email is already in use.' }, { status: 409 })
    }

    console.error('profile update failed', error)
    return NextResponse.json({ error: 'Unable to save your profile right now.' }, { status: 500 })
  }
}
