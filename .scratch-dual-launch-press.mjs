import { createHash, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'
const USERS = ['cmw3uo1i60006u5c47prxml1i', 'cmwapxuhq0005u5gsasceq55f']
const hash = (token) => createHash('sha256').update(token).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function makeSession(userId) {
  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({
    data: { tokenHash: hash(token), userId, expiresAt: new Date(Date.now() + 3600_000) },
  })
  return token
}

async function api(token, path, method = 'GET', body) {
  const started = Date.now()
  try {
    const response = await fetch(BASE + path, {
      method,
      headers: { cookie: `toops_session=${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    })
    const text = await response.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = text.slice(0, 120) }
    return { status: response.status, data, ms: Date.now() - started }
  } catch (error) {
    return { status: 0, data: String(error), ms: Date.now() - started }
  }
}

async function startWaitingMatch(tokenA, tokenB) {
  const a = await api(tokenA, '/api/dual/queue', 'POST', { stake: '1.00' })
  const b = await api(tokenB, '/api/dual/queue', 'POST', { stake: '1.00' })
  console.log('queue', a.status, b.status)
  const match = await prisma.dualMatch.findFirst({
    where: { players: { some: { userId: { in: USERS } } }, status: 'WAITING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return match.id
}

const before = await prisma.user.findMany({
  where: { id: { in: USERS } },
  select: { id: true, balancePusd: true, activeMatchId: true },
})
await prisma.dualTicket.deleteMany({ where: { userId: { in: USERS } } })
await prisma.user.updateMany({
  where: { id: { in: USERS } },
  data: { activeMatchId: null, balancePusd: 10_000n },
})

const [tokenA, tokenB] = await Promise.all(USERS.map(makeSession))

// ── 1. press before the scheduled launch must be rejected ──────────────────
const earlyId = await startWaitingMatch(tokenA, tokenB)
const now = Date.now()
await prisma.dualMatch.update({
  where: { id: earlyId },
  data: {
    status: 'COUNTDOWN',
    startsAt: new Date(now + 25_000),
    readyDeadlineAt: new Date(now + 60_000),
    crashMultiplierX100: 500,
    crashAt: null,
  },
})
await prisma.dualMatchPlayer.updateMany({ where: { matchId: earlyId }, data: { ready: true, lastSeenAt: new Date() } })
const early = await api(tokenA, '/api/dual/cashout', 'POST', { matchId: earlyId })
console.log('early press ->', early.status, JSON.stringify(early.data))
await prisma.user.updateMany({ where: { id: { in: USERS } }, data: { activeMatchId: null } })
await prisma.dualMatch.update({
  where: { id: earlyId },
  data: { status: 'CANCELLED', endedAt: new Date(), disputeReason: 'Local test cleanup.' },
})
await prisma.dualTicket.deleteMany({ where: { userId: { in: USERS } } })

// ── 2. press right after launch, with the row still in COUNTDOWN ───────────
const lateId = await startWaitingMatch(tokenA, tokenB)
const now2 = Date.now()
await prisma.dualMatch.update({
  where: { id: lateId },
  data: {
    status: 'COUNTDOWN',
    startsAt: new Date(now2 + 2_000),
    readyDeadlineAt: new Date(now2 + 60_000),
    crashMultiplierX100: 500,
    crashAt: null,
  },
})
await prisma.dualMatchPlayer.updateMany({ where: { matchId: lateId }, data: { ready: true, lastSeenAt: new Date() } })
await sleep(3_000)
const still = await prisma.dualMatch.findUnique({ where: { id: lateId }, select: { status: true } })
console.log('db status before press', still)
const late = await api(tokenA, '/api/dual/cashout', 'POST', { matchId: lateId })
console.log('launch press ->', late.status, JSON.stringify(late.data), late.ms + 'ms')
const after = await prisma.dualMatch.findUnique({
  where: { id: lateId },
  select: {
    status: true,
    startsAt: true,
    crashAt: true,
    players: { select: { userId: true, cashoutMultiplierX100: true } },
  },
})
console.log('db after press', after)

await prisma.user.updateMany({ where: { id: { in: USERS } }, data: { activeMatchId: null } })
await prisma.dualMatch.update({
  where: { id: lateId },
  data: { status: 'CANCELLED', endedAt: new Date(), disputeReason: 'Local test cleanup.' },
})
await prisma.dualTicket.deleteMany({ where: { userId: { in: USERS } } })
for (const snapshot of before) {
  await prisma.user.update({
    where: { id: snapshot.id },
    data: { balancePusd: snapshot.balancePusd, activeMatchId: snapshot.activeMatchId },
  })
}
await prisma.session.deleteMany({ where: { tokenHash: { in: [hash(tokenA), hash(tokenB)] } } })
await prisma.$disconnect()
console.log('done')
