import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'
const A = 'zcjwu6AXzh-IovHmxxxqCfPH40RmuyBFHniU3Ihr7kw'
const B = 'S1gL3dPRWoi_mOrpeWvp7qWpU0RjQGQGN7V9g5icMT8'
const A_ID = 'cmw9kz28q0000u5j46ug91o0i'
const B_ID = 'cmw9kz6r10003u5j49s7i3zu5'

let failures = 0
function check(label, condition, extra = '') {
  if (condition) console.log(`  PASS  ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}${extra ? ` :: ${extra}` : ''}`)
  }
}
async function api(token, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      cookie: `toops_session=${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data }
}
const state = (token) => api(token, '/api/dual/state')
const post = (token, path, body) =>
  api(token, path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

async function balances() {
  const rows = await prisma.user.findMany({
    where: { id: { in: [A_ID, B_ID] } },
    select: { id: true, balancePusd: true },
  })
  const map = Object.fromEntries(rows.map((r) => [r.id, r.balancePusd]))
  return { a: map[A_ID], b: map[B_ID] }
}

async function reset() {
  await prisma.dualTicket.deleteMany({ where: { userId: { in: [A_ID, B_ID] } } })
  await prisma.user.updateMany({
    where: { id: { in: [A_ID, B_ID] } },
    data: { balancePusd: 100_000n, activeMatchId: null },
  })
}

async function createMatch(stake = '2.00') {
  const first = await post(A, '/api/dual/queue', { stake })
  const second = await post(B, '/api/dual/queue', { stake })
  if (first.status !== 200 || second.status !== 200) {
    throw new Error(`queue failed ${JSON.stringify({ first, second })}`)
  }
  return second.data.matchId ?? first.data.matchId
}

async function freshLastSeen(matchId) {
  await prisma.dualMatchPlayer.updateMany({
    where: { matchId },
    data: { lastSeenAt: new Date() },
  })
}

function startHeartbeat(matchId) {
  const control = { stopped: false, timer: null }
  const beat = async () => {
    if (control.stopped) return
    try {
      await freshLastSeen(matchId)
    } catch {
      // ignore
    }
    if (!control.stopped) control.timer = setTimeout(beat, 400)
  }
  void beat()
  return () => {
    control.stopped = true
    if (control.timer) clearTimeout(control.timer)
  }
}

async function main() {
  // Cancel a stuck round left by the long smoke run.
  await prisma.dualMatch.updateMany({
    where: { status: { in: ['RUNNING', 'COUNTDOWN', 'INTERMISSION'] } },
    data: { status: 'CANCELLED', endedAt: new Date(), disputeReason: 'smoke cleanup' },
  })
  await reset()

  console.log('\n== verify an untampered cancelled round ==')
  const verifyId = await createMatch('2.00')
  check('match created for verify', typeof verifyId === 'string')
  const cancel = await post(A, '/api/dual/cancel', { matchId: verifyId })
  check('cancel accepted', cancel.status === 200, JSON.stringify(cancel))
  const verify = await api(A, `/api/dual/verify?matchId=${verifyId}&round=1`)
  check('verify 200', verify.status === 200, JSON.stringify(verify.data))
  check('hash matches', verify.data?.hashMatches === true)
  check('crash matches', verify.data?.crashMatches === true)
  check(
    'expected equals stored',
    verify.data?.expectedCrashMultiplierX100 === verify.data?.storedCrashMultiplierX100,
    `${verify.data?.expectedCrashMultiplierX100} vs ${verify.data?.storedCrashMultiplierX100}`,
  )
  check(
    'both client seeds revealed',
    Array.isArray(verify.data?.clientSeeds) && verify.data.clientSeeds.length === 2,
  )
  const cancelBal = await balances()
  check('both refunded after cancel', cancelBal.a === 100_000n && cancelBal.b === 100_000n, JSON.stringify({ a: String(cancelBal.a), b: String(cancelBal.b) }))
  const cancelLedger = await prisma.ledgerEntry.count({
    where: { reference: { startsWith: `dual:refund:${verifyId}:` } },
  })
  check('two refund ledger rows', cancelLedger === 2, String(cancelLedger))
  await post(A, '/api/dual/leave', { matchId: verifyId })
  await post(B, '/api/dual/leave', { matchId: verifyId })

  console.log('\n== rematch handshake on a settled match ==')
  await reset()
  const settleId = await createMatch('2.00')
  const settled = await prisma.dualMatch.update({
    where: { id: settleId },
    data: {
      status: 'SETTLED',
      endedAt: new Date(),
      winnerUserId: A_ID,
      potPusd: 400n,
      feePusd: 4n,
      payoutPusd: 396n,
      rematchCreatedAt: null,
    },
  })
  check('staged a settled match to rematch', settled != null, settled?.id)
  if (settled) {
    await reset()
    const rA = await post(A, '/api/dual/rematch', { matchId: settled.id, action: 'request' })
    check('A request is pending', rA.status === 200 && rA.data?.matchId === null, JSON.stringify(rA))
    const rB = await post(B, '/api/dual/rematch', { matchId: settled.id, action: 'request' })
    check('B acceptance creates rematch', rB.status === 200 && typeof rB.data?.matchId === 'string', JSON.stringify(rB))
    const rematchId = rB.data?.matchId
    const rematchState = await state(A)
    check(
      'A is moved to the rematch',
      typeof rematchId === 'string' && rematchState.data?.match?.id === rematchId,
      rematchState.data?.match?.id,
    )
    check('rematch starts WAITING', rematchState.data?.match?.status === 'WAITING', rematchState.data?.match?.status)
    const locked = await balances()
    check('rematch locks both stakes', locked.a === 99_800n && locked.b === 99_800n, JSON.stringify({ a: String(locked.a), b: String(locked.b) }))
    const cancelRematch = await post(A, '/api/dual/cancel', { matchId: rematchId })
    check('rematch cancel accepted', cancelRematch.status === 200, JSON.stringify(cancelRematch))
    const refunded = await balances()
    check('rematch cancel refunds both', refunded.a === 100_000n && refunded.b === 100_000n, JSON.stringify({ a: String(refunded.a), b: String(refunded.b) }))
    await post(A, '/api/dual/leave', { matchId: rematchId })
    await post(B, '/api/dual/leave', { matchId: rematchId })
  }

  console.log('\n== queue cancel refunds ==')
  await reset()
  const q = await post(A, '/api/dual/queue', { stake: '5.00' })
  check('queued at 5.00', q.status === 200 && q.data?.matchId === null, JSON.stringify(q))
  const qState = await state(A)
  check('queue is visible', qState.data?.queue?.stakePusd === '5.00')
  const qLocked = await balances()
  check('queue locks 5.00', qLocked.a === 99_500n, String(qLocked.a))
  const qDel = await api(A, '/api/dual/queue', { method: 'DELETE' })
  check('queue cancel ok', qDel.status === 200, JSON.stringify(qDel))
  const qRefund = await balances()
  check('queue cancel refunds', qRefund.a === 100_000n, String(qRefund.a))

  console.log('\n== both-bust replay (staged RUNNING state) ==')
  await reset()
  const bustId = await createMatch('2.00')
  const before = await prisma.dualMatch.findUnique({ where: { id: bustId } })
  await prisma.dualMatch.update({
    where: { id: bustId },
    data: {
      status: 'RUNNING',
      startsAt: new Date(Date.now() - 5_000),
      crashAt: new Date(Date.now() - 1_000),
      crashMultiplierX100: 101,
    },
  })
  const stopHeartbeat = startHeartbeat(bustId)
  await freshLastSeen(bustId)
  const bustState = await state(A)
  let m = bustState.data?.match
  check('both-bust auto-replays', (m?.replayCount ?? 0) >= 1, JSON.stringify({ status: m?.status, replay: m?.replayCount }))
  check('no winner after both bust', m?.winnerUserId === null, m?.winnerUserId)

  if (m?.status === 'INTERMISSION') {
    check('intermission before replay', m?.round === 1, String(m?.round))
    await prisma.dualMatch.update({
      where: { id: bustId },
      data: { intermissionEndsAt: new Date(Date.now() - 1_000) },
    })
    await freshLastSeen(bustId)
    const replayState = await state(A)
    m = replayState.data?.match ?? m
  }

  const row = await prisma.dualMatch.findUnique({ where: { id: bustId } })
  check('replay advances to round 2 or later', (m?.round ?? 0) >= 2, String(m?.round))
  check('nonce tracks the replay round', row != null && row.nonce === row.round - 1, `${row?.nonce} / ${row?.round}`)
  check('replay has a new seed hash', row?.serverSeedHash !== before?.serverSeedHash)
  check('no fee charged while replaying', row?.feePusd === 0n, String(row?.feePusd))
  check('stakes stay locked across replay', (await balances()).a === 99_800n, String((await balances()).a))
  stopHeartbeat()

  // Cleanup
  await prisma.user.updateMany({
    where: { activeMatchId: bustId },
    data: { activeMatchId: null, balancePusd: { increment: 200n } },
  })
  await prisma.dualMatch.update({
    where: { id: bustId },
    data: { status: 'CANCELLED', endedAt: new Date(), disputeReason: 'smoke cleanup' },
  })

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('\nSMOKE TEST ERROR:', error)
  await prisma.$disconnect()
  process.exit(2)
})
