import { createHash, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function ensureUser(tag, displayName) {
  const telegramId = `smoke-${tag}`
  let user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        displayName,
        balancePusd: 100_000n,
        clientSeed: randomBytes(16).toString('hex'),
      },
    })
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { balancePusd: 100_000n, activeMatchId: null },
    })
  }

  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  return { id: user.id, token, displayName: user.displayName }
}

const a = await ensureUser('a', 'Smoke Alice')
const b = await ensureUser('b', 'Smoke Bob')
console.log(JSON.stringify({ a, b }, null, 2))
await prisma.$disconnect()
