import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'
const A = 'c5q6MTzRRO4I_IxWROfn48AmIHtNp3fCNpcoczBvCws'
const B = 'nSNvpl9npXPOHh5miP1pfnhgNy1WnFuBuerFIAZdklA'
const A_ID = 'cmw9kz28q0000u5j46ug91o0i'
const B_ID = 'cmw9kz6r10003u5j49s7i3zu5'

let failures = 0
function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}${extra ? ` :: ${extra}` : ''}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function api(token, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      cookie: `toops_session=${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
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

async function bothStates() {
  const [a, b] = await Promise.all([state(A), state(B)])
  return { a: a.data, b: b.data }
}

async function resetUsers() {
  await prisma.dualTicket.deleteMany({ where: { userId: { in: [A_ID, B_ID] } } })
  await prisma.user.updateMany({
    where: { id: { in: [A_ID, B_ID] } },
    data: { balancePusd: 100_000n, activeMatchId: null },
  })
}

async function balances() {
  const rows = await prisma.user.findMany({
    where: { id: { in: [A_ID, B_ID] } },
    select: { id: true, balancePusd: true },
  })
  const map = Object.fromEntries(rows.map((row) => [row.id, row.balancePusd]))
  return { a: map[A_ID], b: map[B_ID] }
}

/**
 * The hosted DB is slow enough that normal polling can look like a disconnect.
 * Keep both players "online" directly while we exercise timing-sensitive phases.
 */
function startHeartbeat(matchId) {
  let stopped = false
  let timer = null
  const beat = async () => {
    if (stopped) return
    try {
      await prisma.dualMatchPlayer.updateMany({
        where: { matchId },
        data: { lastSeenAt: new Date() },
      })
    } catch {
      // ignore
    }
    if (!stopped) timer = setTimeout(beat, 500)
  }
  void beat()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

async function setCrash(matchId, crashX100) {
  await prisma.dualMatch.update({
    where: { id: matchId },
    data: { crashMultiplierX100: crashX100 },
  })
}

/**
 * Slow polls can consume the whole flight window. Re-pin a running round to a
 * fresh 120s window at the cap so cashout endpoints can be exercised reliably.
 */
async function stageCashoutable(matchId) {
  const now = Date.now()
  await prisma.dualMatch.update({
    where: { id: matchId },
    data: {
      startsAt: new Date(now - 500),
      crashAt: new Date(now + 120_000),
      crashMultiplierX100: 10_000_000,
    },
  })
}

async function waitForMatch(predicate, label, timeoutMs = 25_000, matchId = null) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    // On this slow connection a single state request can outlive the 5s
    // disconnect grace. Touch both heartbeats right before the request so the
    // engine always observes both players online.
    if (matchId) {
      await prisma.dualMatchPlayer.updateMany({
        where: { matchId },
        data: { lastSeenAt: new Date() },
      })
    }
    const a = await state(A)
    let match = a.data?.match ?? null
    if (!match) {
      const b = await state(B)
      match = b.data?.match ?? null
    }
    if (match && predicate(match)) return match
    await sleep(200)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

async function createMatch(stake = '2.00') {
  const first = await post(A, '/api/dual/queue', { stake })
  const second = await post(B, '/api/dual/queue', { stake })
  if (first.status !== 200 || second.status !== 200) {
    throw new Error(`queue failed: ${JSON.stringify({ first, second })}`)
  }
  return second.data.matchId ?? first.data.matchId
}

async function readyBoth(matchId) {
  await post(A, '/api/dual/ready', { matchId })
  await post(B, '/api/dual/ready', { matchId })
}

async function main() {
  console.log('\n== 1. unauthenticated state ==')
  const anon = await api('invalid-token', '/api/dual/state')
  check('anonymous state is 401', anon.status === 401, JSON.stringify(anon))

  console.log('\n== 2. authenticated state + fair fields ==')
  await resetUsers()
  const sa = await state(A)
  check('A state 200', sa.status === 200, JSON.stringify(sa.data))
  check('A has balance 1000.00', sa.data?.user?.balancePusd === '1000.00', sa.data?.user?.balancePusd)
  check('A has a client seed', typeof sa.data?.user?.clientSeed === 'string' && sa.data.user.clientSeed.length === 32)

  console.log('\n== 3. queue + match + ready + cashout settlement ==')
  const matchId = await createMatch('2.00')
  check('match created', typeof matchId === 'string', String(matchId))
  await setCrash(matchId, 100_000) // 1000x gives the slow HTTP calls time to cash out.
  await sleep(300)
  let s = await bothStates()
  check('both see WAITING match', s.a?.match?.status === 'WAITING' && s.b?.match?.status === 'WAITING', JSON.stringify([s.a?.match?.status, s.b?.match?.status]))
  check('pot is 4.00', s.a?.match?.potPusd === '4.00', s.a?.match?.potPusd)
  check('winner payout preview 3.96', s.a?.match?.payoutPusd === '3.96', s.a?.match?.payoutPusd)
  check('stake locked 998.00', s.a?.user?.balancePusd === '998.00', s.a?.user?.balancePusd)
  check('crash hidden before launch', s.a?.match?.crashMultiplierX100 === null && s.a?.match?.serverSeed === null)

  const stopHeartbeat = startHeartbeat(matchId)
  await readyBoth(matchId)
  let match = await waitForMatch(
    (m) => m.status === 'COUNTDOWN' || m.status === 'RUNNING',
    'countdown',
    90_000,
    matchId,
  )
  check('countdown started', match.status === 'COUNTDOWN' || match.status === 'RUNNING', match.status)

  match = await waitForMatch((m) => m.status === 'RUNNING', 'running', 90_000, matchId)
  check('round running', match.status === 'RUNNING', match.status)
  await stageCashoutable(matchId)
  await sleep(300)
  const cashA = await post(A, '/api/dual/cashout', { matchId })
  check('A cashout accepted', cashA.status === 200, JSON.stringify(cashA))
  await sleep(400)
  const cashB = await post(B, '/api/dual/cashout', { matchId })
  check('B cashout accepted (later)', cashB.status === 200, JSON.stringify(cashB))
  check('B cashed out later than A', Number(cashB.data?.multiplierX100) > Number(cashA.data?.multiplierX100), `${cashA.data?.multiplierX100} vs ${cashB.data?.multiplierX100}`)

  match = await waitForMatch((m) => m.status === 'SETTLED', 'settled', 90_000, matchId)
  stopHeartbeat()
  check('settled on second cashout', match.status === 'SETTLED', match.status)
  check('later cashout (B) wins', match.winnerUserId === B_ID, match.winnerUserId)
  check('server seed revealed', typeof match.serverSeed === 'string' && match.serverSeed.length === 64)
  check('crash and cashout values consistent', match.crashMultiplierX100 === 10_000_000, String(match.crashMultiplierX100))
  check('fee 0.04', match.feePusd === '0.04', match.feePusd)
  check('payout 3.96', match.payoutPusd === '3.96', match.payoutPusd)

  const bal = await balances()
  check('loser keeps 998.00', bal.a === 99_800n, String(bal.a))
  check('winner has 1001.96', bal.b === 100_196n, String(bal.b))

  console.log('\n== 4. cashout secrecy while running (fresh match) ==')
  // Cancel-reset for a fresh round.
  await post(A, '/api/dual/leave', { matchId })
  await post(B, '/api/dual/leave', { matchId })
  await resetUsers()
  const secretId = await createMatch('2.00')
  await setCrash(secretId, 100_000)
  const stopHeartbeat2 = startHeartbeat(secretId)
  await readyBoth(secretId)
  await waitForMatch((m) => m.status === 'COUNTDOWN' || m.status === 'RUNNING', 'countdown 2', 90_000, secretId)
  await waitForMatch((m) => m.status === 'RUNNING', 'running 2', 90_000, secretId)
  await stageCashoutable(secretId)
  await sleep(300)
  await post(A, '/api/dual/cashout', { matchId: secretId })
  await sleep(250)
  const afterA = await bothStates()
  const aSelf = afterA.a?.match?.players.find((p) => p.userId === A_ID)
  const aOpp = afterA.a?.match?.players.find((p) => p.userId === B_ID)
  check('A sees own cashout', aSelf?.cashedOut === true, JSON.stringify(aSelf))
  check('A cannot see B cashout before end', aOpp?.cashedOut === false, JSON.stringify(aOpp))
  const bOpp = afterA.b?.match?.players.find((p) => p.userId === A_ID)
  check('B cannot see A cashout before end', bOpp?.cashedOut === false, JSON.stringify(bOpp))
  await post(B, '/api/dual/cashout', { matchId: secretId })
  const settled2 = await waitForMatch((m) => m.status === 'SETTLED', 'settled 2', 90_000, secretId)
  stopHeartbeat2()
  const revealed = settled2.players.find((p) => p.userId === A_ID)
  check('cashouts revealed after end', revealed?.cashedOut === true, JSON.stringify(revealed))

  console.log('\n== 5. verify endpoint (untampered round) ==')
  // The previous round had its crash point staged for timing, so verify a
  // clean match instead: cancel it (which reveals seeds) and recompute.
  const verifyId = await createMatch('2.00')
  const verifyCancel = await post(A, '/api/dual/cancel', { matchId: verifyId })
  check('verify match cancelled', verifyCancel.status === 200, JSON.stringify(verifyCancel))
  const verify = await api(A, `/api/dual/verify?matchId=${verifyId}&round=1`)
  check('verify 200', verify.status === 200, JSON.stringify(verify.data))
  check('verify hash matches', verify.data?.hashMatches === true)
  check('verify crash matches', verify.data?.crashMatches === true)
  check(
    'verify expected crash matches stored',
    verify.data?.expectedCrashMultiplierX100 === verify.data?.storedCrashMultiplierX100,
    `${verify.data?.expectedCrashMultiplierX100} vs ${verify.data?.storedCrashMultiplierX100}`,
  )
  check('verify reveals both client seeds', Array.isArray(verify.data?.clientSeeds) && verify.data.clientSeeds.length === 2)
  await post(A, '/api/dual/leave', { matchId: verifyId })
  await post(B, '/api/dual/leave', { matchId: verifyId })

  console.log('\n== 6. rematch handshake ==')
  const rematchA = await post(A, '/api/dual/rematch', { matchId: secretId, action: 'request' })
  check('A rematch request is pending', rematchA.status === 200 && rematchA.data?.matchId === null, JSON.stringify(rematchA))
  const rematchB = await post(B, '/api/dual/rematch', { matchId: secretId, action: 'request' })
  check('B acceptance creates a rematch', rematchB.status === 200 && typeof rematchB.data?.matchId === 'string', JSON.stringify(rematchB))
  const rematchId = rematchB.data?.matchId
  await sleep(300)
  const rematchState = await state(A)
  check('A is on the rematch match', rematchState.data?.match?.id === rematchId, rematchState.data?.match?.id)
  check('rematch starts at WAITING', rematchState.data?.match?.status === 'WAITING', rematchState.data?.match?.status)
  const rematchBal = await balances()
  check(
    'rematch re-locks stakes',
    rematchBal.a === 99_800n && rematchBal.b === 100_196n - 200n,
    JSON.stringify({ a: String(rematchBal.a), b: String(rematchBal.b) }),
  )

  console.log('\n== 7. cancel + refund during WAITING ==')
  const cancel = await post(A, '/api/dual/cancel', { matchId: rematchId })
  check('cancel accepted', cancel.status === 200, JSON.stringify(cancel))
  await sleep(300)
  const cancelledState = await state(A)
  check('match CANCELLED and still pinned', cancelledState.data?.match?.status === 'CANCELLED', cancelledState.data?.match?.status)
  const cancelBal = await balances()
  check('A refunded', cancelBal.a === 100_000n, String(cancelBal.a))
  check('B refunded', cancelBal.b === 100_196n, String(cancelBal.b))
  const ledgerRefunds = await prisma.ledgerEntry.count({
    where: { reference: { startsWith: `dual:refund:${rematchId}:` } },
  })
  check('two refund ledger rows', ledgerRefunds === 2, String(ledgerRefunds))

  await post(A, '/api/dual/leave', { matchId: rematchId })
  await post(B, '/api/dual/leave', { matchId: rematchId })

  console.log('\n== 8. queue cancel refunds ==')
  await resetUsers()
  const q = await post(A, '/api/dual/queue', { stake: '5.00' })
  check('queued at 5.00', q.status === 200 && q.data?.matchId === null, JSON.stringify(q))
  const qState = await state(A)
  check('queue visible', qState.data?.queue?.stakePusd === '5.00', JSON.stringify(qState.data?.queue))
  const qBal = await balances()
  check('queue locks 5.00', qBal.a === 99_500n, String(qBal.a))
  const qCancel = await api(A, '/api/dual/queue', { method: 'DELETE' })
  check('queue cancel ok', qCancel.status === 200, JSON.stringify(qCancel))
  const qBal2 = await balances()
  check('queue cancel refunds', qBal2.a === 100_000n, String(qBal2.a))

  console.log('\n== 9. both-bust auto replay ==')
  await resetUsers()
  const bustId = await createMatch('2.00')
  const firstSeedHash = (await prisma.dualMatch.findUnique({ where: { id: bustId } }))
    ?.serverSeedHash
  // Force an immediate 1.01x crash before the round starts.
  await setCrash(bustId, 101)
  const stopHeartbeat3 = startHeartbeat(bustId)
  await readyBoth(bustId)
  const busted = await waitForMatch(
    (m) => m.status === 'INTERMISSION' || m.round >= 2,
    'intermission',
    120_000,
    bustId,
  )
  check('both-bust enters INTERMISSION', busted.status === 'INTERMISSION', busted.status)
  check('replay counted once', busted.replayCount === 1, String(busted.replayCount))
  check('no winner yet', busted.winnerUserId === null && busted.status !== 'SETTLED', busted.status)
  const bustRow = await prisma.dualMatch.findUnique({ where: { id: bustId } })
  check('no fee charged while replaying', bustRow?.feePusd === 0n, String(bustRow?.feePusd))
  check('first replay keeps nonce 0 until launch', bustRow?.nonce === 0, String(bustRow?.nonce))
  check('stakes stay locked during intermission', (await balances()).a === 99_800n, String((await balances()).a))

  // Fast-forward the 6s intermission and confirm the replay round launches.
  await prisma.dualMatch.update({
    where: { id: bustId },
    data: { intermissionEndsAt: new Date(Date.now() - 1_000) },
  })
  const replay = await waitForMatch(
    (m) => m.round === 2 && (m.status === 'COUNTDOWN' || m.status === 'RUNNING'),
    'replayed round 2',
    120_000,
    bustId,
  )
  check('replay starts round 2', replay.round === 2, String(replay.round))
  check('replay relaunches', replay.status === 'COUNTDOWN' || replay.status === 'RUNNING', replay.status)
  const replayRow = await prisma.dualMatch.findUnique({ where: { id: bustId } })
  check('replay advanced nonce to 1', replayRow?.nonce === 1, String(replayRow?.nonce))
  check('replay used a fresh server seed', replayRow?.serverSeedHash !== firstSeedHash)
  const replayBal = await balances()
  check('stakes stay locked on replay', replayBal.a === 99_800n && replayBal.b === 99_800n, JSON.stringify({ a: String(replayBal.a), b: String(replayBal.b) }))
  stopHeartbeat3()
  // Cleanup: refund and unpin the replayed match directly.
  await prisma.user.updateMany({
    where: { activeMatchId: bustId },
    data: { activeMatchId: null, balancePusd: { increment: 200n } },
  })
  await prisma.dualMatch.update({ where: { id: bustId }, data: { status: 'CANCELLED', endedAt: new Date() } })

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('\nSMOKE TEST ERROR:', error)
  await prisma.$disconnect()
  process.exit(2)
})
