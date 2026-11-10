import { createHash, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'
const USERS = ['cmw3uo1i60006u5c47prxml1i', 'cmwapxuhq0005u5gsasceq55f']

function hash(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function makeSession(userId) {
  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })
  return token
}

async function api(token, path, method = 'GET', body) {
  const started = Date.now()
  const response = await fetch(BASE + path, {
    method,
    headers: {
      cookie: `toops_session=${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text.slice(0, 120)
  }
  return { status: response.status, data, ms: Date.now() - started }
}

const before = await prisma.user.findMany({
  where: { id: { in: USERS } },
  select: { id: true, balancePusd: true, activeMatchId: true },
})
console.log('before', before.map((u) => [u.id, u.balancePusd.toString(), u.activeMatchId]))

await prisma.dualTicket.deleteMany({ where: { userId: { in: USERS } } })
await prisma.user.updateMany({ where: { id: { in: USERS } }, data: { activeMatchId: null } })
await prisma.user.updateMany({
  where: { id: { in: USERS } },
  data: { balancePusd: 10_000n },
})

const [tokenA, tokenB] = await Promise.all(USERS.map(makeSession))

const queueA = await api(tokenA, '/api/dual/queue', 'POST', { stake: '1.00' })
console.log('queue A', queueA.status, queueA.data, queueA.ms + 'ms')
const queueB = await api(tokenB, '/api/dual/queue', 'POST', { stake: '1.00' })
console.log('queue B', queueB.status, queueB.data, queueB.ms + 'ms')

const matchId = queueB.data?.matchId ?? queueA.data?.matchId
if (!matchId) {
  console.log('no match created; aborting')
  await prisma.$disconnect()
  process.exit(0)
}

const log = (who, phase, extra) =>
  console.log(
    `${new Date().toISOString().slice(11, 23)} ${who} ${phase} ${extra}`,
  )

let finished = false
const startedAt = Date.now()

// Emulate the new client: a lightweight presence ping every 4s, independently
// of the heavier state poll.
const heartbeats = USERS.map(async (userId, index) => {
  const token = index === 0 ? tokenA : tokenB
  let sent = 0
  let failed = 0
  while (!finished && Date.now() - startedAt < 70_000) {
    await new Promise((r) => setTimeout(r, 4_000))
    if (finished) break
    const ping = await api(token, '/api/dual/heartbeat', 'POST', { matchId })
    sent += 1
    if (ping.status !== 200) failed += 1
  }
  log(index === 0 ? 'A' : 'B', 'heartbeats', `${sent} sent, ${failed} failed`)
})

async function poller(who, token) {
  let readyPosted = false
  let lastStatus = ''
  while (!finished && Date.now() - startedAt < 70_000) {
    const state = await api(token, '/api/dual/state')
    if (state.status !== 200) {
      log(who, 'STATE-ERR', `${state.status} ${JSON.stringify(state.data)} ${state.ms}ms`)
      await new Promise((r) => setTimeout(r, 400))
      continue
    }
    const match = state.data.match
    if (!match) {
      log(who, 'no-match', `${state.ms}ms`)
      await new Promise((r) => setTimeout(r, 400))
      continue
    }
    const self = match.players.find((p) => p.isSelf)
    if (match.status !== lastStatus) {
      log(
        who,
        'STATUS->' + match.status,
        `ready=${self?.ready} online=${self?.online} countdown=${match.countdownMsRemaining} ${state.ms}ms`,
      )
      lastStatus = match.status
    }
    if (match.status === 'WAITING' && !readyPosted) {
      readyPosted = true
      const ready = await api(token, '/api/dual/ready', 'POST', { matchId: match.id })
      log(who, 'READY', `${ready.status} ${ready.ms}ms`)
    }
    if (match.status === 'RUNNING') {
      log(who, 'RUNNING', `mult=${match.currentMultiplierX100}`)
      finished = true
      return
    }
    if (match.status === 'CANCELLED') {
      log(who, 'CANCELLED', JSON.stringify(match.disputeReason ?? match.refunded))
      finished = true
      return
    }
    await new Promise((r) => setTimeout(r, 400))
  }
}

await Promise.all([poller('A', tokenA), poller('B', tokenB)])
finished = true
await Promise.all(heartbeats)

const final = await prisma.dualMatch.findUnique({
  where: { id: matchId },
  include: { players: { orderBy: { seat: 'asc' } } },
})
console.log('final status', final?.status, 'reason', final?.disputeReason)
for (const p of final?.players ?? []) {
  console.log('  seat', p.seat, p.userId.slice(-6), 'ready', p.ready, 'lastSeen', p.lastSeenAt.toISOString())
}

// Restore state.
await prisma.dualTicket.deleteMany({ where: { userId: { in: USERS } } })
for (const snapshot of before) {
  await prisma.user.update({
    where: { id: snapshot.id },
    data: { balancePusd: snapshot.balancePusd, activeMatchId: snapshot.activeMatchId },
  })
}
await prisma.session.deleteMany({ where: { tokenHash: { in: [hash(tokenA), hash(tokenB)] } } })
await prisma.$disconnect()
