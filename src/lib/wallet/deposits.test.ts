import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  binToHex,
  encodeCashAddress,
  encodeLockingBytecodeP2pkh,
  encodeTransactionBch,
} from '@bitauth/libauth'

const h = vi.hoisted(() => {
  type FakeDeposit = {
    id: string
    userId: string
    txid: string
    vout: number
    address: string
    amountSats: bigint
    amountPusd: bigint
    swapTxid: string | null
    swapError: string | null
    height: number | null
    status: 'PENDING' | 'CONFIRMED' | 'SPENT'
    createdAt: Date
  }

  type AnyRow = Record<string, unknown>

  function matchesValue(actual: unknown, condition: unknown): boolean {
    if (condition === null) return actual === null
    if (typeof condition === 'object' && condition !== null) {
      if ('gt' in condition) return (actual as bigint) > (condition as { gt: bigint }).gt
      if ('gte' in condition) return (actual as bigint) >= (condition as { gte: bigint }).gte
      if ('lt' in condition) return (actual as bigint) < (condition as { lt: bigint }).lt
      if ('lte' in condition) return (actual as bigint) <= (condition as { lte: bigint }).lte
      if ('not' in condition) return actual !== (condition as { not: unknown }).not
      throw new Error(`Unsupported Prisma condition: ${JSON.stringify(condition)}`)
    }
    return actual === condition
  }

  function matches(row: AnyRow, where: AnyRow): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as AnyRow[]).some((sub) => matches(row, sub))
      if (key === 'AND') return (value as AnyRow[]).every((sub) => matches(row, sub))
      return matchesValue(row[key], value)
    })
  }

  const store = {
    wallets: [] as Array<{ id: string; userId: string; address: string; derivationIndex: number }>,
    users: new Map<string, bigint>(),
    deposits: [] as FakeDeposit[],
    withdrawals: [] as Array<{ userId: string; txid: string | null }>,
    ledger: [] as AnyRow[],
    nextId: 1,
    history: [] as Array<{ tx_hash: string; height: number }>,
    txs: new Map<string, string>(),
    swap: async (_params: unknown): Promise<{ txid: string; pusdReceived: bigint; satsSpent: bigint }> => {
      throw new Error('swap not configured')
    },
    swapCalls: [] as unknown[],
  }

  const depositApi = {
    findMany: async ({ where = {}, orderBy }: { where?: AnyRow; orderBy?: { createdAt?: 'asc' | 'desc' } } = {}) => {
      const rows = store.deposits.filter((deposit) => matches(deposit, where)).map((deposit) => ({ ...deposit }))
      if (orderBy?.createdAt === 'asc') {
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      }
      return rows
    },
    create: async ({ data }: { data: Omit<FakeDeposit, 'id' | 'createdAt'> }) => {
      if (store.deposits.some((d) => d.txid === data.txid && d.vout === data.vout)) {
        throw new Error(`duplicate outpoint ${data.txid}:${data.vout}`)
      }
      const deposit: FakeDeposit = {
        ...data,
        id: `deposit-${store.nextId++}`,
        createdAt: new Date(),
      }
      store.deposits.push(deposit)
      return { ...deposit }
    },
    updateMany: async ({ where, data }: { where: AnyRow; data: AnyRow }) => {
      let count = 0
      for (const deposit of store.deposits) {
        if (!matches(deposit as unknown as AnyRow, where)) continue
        Object.assign(deposit, data)
        count += 1
      }
      return { count }
    },
  }

  const prisma = {
    platformWallet: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        store.wallets.find((wallet) => wallet.userId === where.userId) ?? null,
      count: async () => store.wallets.length,
      findMany: async () =>
        store.wallets.map((wallet) => ({ userId: wallet.userId, derivationIndex: wallet.derivationIndex })),
    },
    deposit: depositApi,
    withdrawal: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        store.withdrawals.filter((withdrawal) => withdrawal.userId === where.userId),
    },
    user: {
      update: async ({ where, data }: { where: { id: string }; data: { balancePusd: { increment: bigint } } }) => {
        const balancePusd = (store.users.get(where.id) ?? 0n) + data.balancePusd.increment
        store.users.set(where.id, balancePusd)
        return { id: where.id, balancePusd }
      },
    },
    ledgerEntry: {
      create: async ({ data }: { data: AnyRow }) => {
        store.ledger.push(data)
        return data
      },
    },
    $transaction: async <T>(fn: (tx: never) => Promise<T>): Promise<T> => fn(prisma as never),
  }

  return { store, prisma }
})

vi.mock('@/lib/db', () => ({ prisma: h.prisma }))

vi.mock('@/lib/bch/electrum', () => ({
  getAddressHistory: async () => h.store.history,
  getTransactionHex: async (txid: string) => {
    const hex = h.store.txs.get(txid)
    if (!hex) throw new Error(`unknown txid ${txid}`)
    return hex
  },
}))

vi.mock('@/lib/pusd-server', () => ({
  getPusdTokenId: () => 'aa'.repeat(32),
  getPusdRate: async () => ({ bchUsdPrice: 100, satsPerPusd: 100_000n, source: 'env' }),
  getPusdDustSats: () => 1000n,
}))

vi.mock('./swaps', () => ({
  swapBchToPusd: async (params: unknown) => {
    h.store.swapCalls.push(params)
    return h.store.swap(params)
  },
}))

const { syncUserDeposits } = await import('./deposits')

const TOKEN_ID = 'aa'.repeat(32)
const USER_PAYLOAD = new Uint8Array(20).fill(7)
const USER_LOCK = encodeLockingBytecodeP2pkh(USER_PAYLOAD)
const USER_ADDRESS = (() => {
  const encoded = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: USER_PAYLOAD })
  if (typeof encoded === 'string') throw new Error(encoded)
  return encoded.address
})()

const OTHER_LOCK = new Uint8Array(25).fill(0x51)

function hashFor(n: number): Uint8Array {
  return new Uint8Array(32).fill(n)
}

function buildTx(options: {
  inputs: Array<{ hash: number; vout?: number }>
  outputs: Array<{ sats: bigint; lock?: Uint8Array; token?: { category: string; amount: bigint } }>
}): string {
  const transaction = {
    version: 2,
    locktime: 0,
    inputs: options.inputs.map((input) => ({
      outpointTransactionHash: hashFor(input.hash),
      outpointIndex: input.vout ?? 0,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(0),
    })),
    outputs: options.outputs.map((output) => ({
      lockingBytecode: output.lock ?? OTHER_LOCK,
      valueSatoshis: output.sats,
      ...(output.token
        ? {
            token: {
              category: Uint8Array.from(Buffer.from(output.token.category, 'hex')),
              amount: output.token.amount,
            },
          }
        : {}),
    })),
  }
  return binToHex(encodeTransactionBch(transaction))
}

function addDeposit(overrides: Partial<(typeof h.store)['deposits'][number]>) {
  const deposit = {
    id: `deposit-${h.store.nextId++}`,
    userId: 'user-1',
    txid: '11'.repeat(32),
    vout: 0,
    address: USER_ADDRESS,
    amountSats: 0n,
    amountPusd: 0n,
    swapTxid: null,
    swapError: null,
    height: 100,
    status: 'CONFIRMED' as const,
    createdAt: new Date(Date.now() + h.store.nextId),
    ...overrides,
  }
  h.store.deposits.push(deposit)
  return deposit
}

beforeAll(() => {
  h.store.wallets.push({
    id: 'wallet-1',
    userId: 'user-1',
    address: USER_ADDRESS,
    derivationIndex: 0,
  })
})

beforeEach(() => {
  h.store.deposits = []
  h.store.withdrawals = []
  h.store.ledger = []
  h.store.history = []
  h.store.txs = new Map()
  h.store.users = new Map([['user-1', 0n]])
  h.store.nextId = 1
  h.store.swapCalls = []
  h.store.swap = async () => {
    throw new Error('swap not configured')
  }
})

describe('syncUserDeposits', () => {
  it('credits a BCH deposit even when it spends an output of an earlier deposit transaction', async () => {
    const first = 'ab'.repeat(32)
    const second = 'cd'.repeat(32)

    // The first transaction paid the platform 100k sats on vout 1, but vout 0
    // belongs to a third party (P2SH). The second transaction spends that P2SH
    // output and pays the platform again.
    h.store.txs.set(
      first,
      buildTx({
        inputs: [{ hash: 1 }],
        outputs: [
          { sats: 500_000n },
          { sats: 100_000n, lock: USER_LOCK },
        ],
      }),
    )
    h.store.txs.set(
      second,
      buildTx({
        inputs: [{ hash: 1, vout: 0 }],
        outputs: [
          { sats: 400_000n },
          { sats: 100_000n, lock: USER_LOCK },
        ],
      }),
    )

    addDeposit({
      txid: first,
      vout: 1,
      amountSats: 100_000n,
      amountPusd: 100n,
      status: 'CONFIRMED',
      height: 100,
    })
    h.store.history = [
      { tx_hash: first, height: 100 },
      { tx_hash: second, height: 101 },
    ]
    h.store.swap = async () => ({
      txid: 'ee'.repeat(32),
      pusdReceived: 98n,
      satsSpent: 97_000n,
    })

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.creditedPusd).toBe(98n)
    expect(result.errors).toEqual([])
    expect(h.store.users.get('user-1')).toBe(98n)
    expect(h.store.deposits.find((d) => d.txid === second)?.status).toBe('CONFIRMED')
  })

  it('ignores change sent back by a platform swap or withdrawal', async () => {
    const depositTx = '11'.repeat(32)
    const swapTx = '22'.repeat(32)

    h.store.txs.set(
      swapTx,
      buildTx({
        inputs: [{ hash: 0x11, vout: 0 }],
        outputs: [
          { sats: 1000n, lock: USER_LOCK, token: { category: TOKEN_ID, amount: 500n } },
          { sats: 40_000n, lock: USER_LOCK },
        ],
      }),
    )

    addDeposit({
      txid: depositTx,
      vout: 0,
      amountSats: 100_000n,
      amountPusd: 100n,
      status: 'CONFIRMED',
    })
    h.store.history = [{ tx_hash: swapTx, height: 200 }]

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(0)
    expect(result.creditedPusd).toBe(0n)
    expect(h.store.deposits).toHaveLength(1)
  })

  it('credits PUSD token outputs 1:1 without a swap', async () => {
    const txid = '33'.repeat(32)
    h.store.txs.set(
      txid,
      buildTx({
        inputs: [{ hash: 3 }],
        outputs: [{ sats: 1000n, lock: USER_LOCK, token: { category: TOKEN_ID, amount: 12_345n } }],
      }),
    )
    h.store.history = [{ tx_hash: txid, height: 300 }]

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.creditedPusd).toBe(12_345n)
    expect(result.swappedDeposits).toBe(0)
    expect(h.store.users.get('user-1')).toBe(12_345n)
    expect(h.store.swapCalls).toHaveLength(0)
  })

  it('converts legacy BCH deposits that were only credited to the old satoshi balance', async () => {
    h.store.swap = async () => ({
      txid: 'ff'.repeat(32),
      pusdReceived: 985n,
      satsSpent: 998_000n,
    })
    addDeposit({
      txid: '44'.repeat(32),
      vout: 0,
      amountSats: 1_000_000n,
      amountPusd: 0n,
      status: 'CONFIRMED',
      height: 50,
    })
    h.store.history = [{ tx_hash: '44'.repeat(32), height: 50 }]

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.creditedPusd).toBe(985n)
    expect(result.swappedDeposits).toBe(1)
    expect(h.store.users.get('user-1')).toBe(985n)
    expect(h.store.deposits[0]?.amountPusd).toBe(985n)
    expect(h.store.deposits[0]?.swapTxid).toBe('ff'.repeat(32))
    expect(h.store.ledger).toHaveLength(1)
    expect(h.store.ledger[0]?.amountPusd).toBe(985n)

    // A second sync must not credit the same deposit twice.
    const again = await syncUserDeposits('user-1')
    expect(again.newDeposits).toBe(0)
    expect(h.store.users.get('user-1')).toBe(985n)
  })

  it('retries deposits that were left pending by an earlier failed run', async () => {
    addDeposit({
      txid: '55'.repeat(32),
      vout: 1,
      amountSats: 200_000n,
      amountPusd: 0n,
      status: 'PENDING',
      swapError: null,
    })
    h.store.history = []

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.creditedPusd).toBe(200n)
    expect(h.store.users.get('user-1')).toBe(200n)
    expect(h.store.deposits[0]?.status).toBe('CONFIRMED')
  })

  it('falls back to the oracle rate and records the error when a swap fails', async () => {
    h.store.swap = async () => {
      throw new Error('no Cauldron liquidity\n\nBitauth URI: https://ide.bitauth.com/import-template/abc')
    }
    addDeposit({
      txid: '66'.repeat(32),
      vout: 0,
      amountSats: 500_000n,
      amountPusd: 0n,
      status: 'PENDING',
    })

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.creditedPusd).toBe(500n)
    expect(result.swappedDeposits).toBe(0)
    expect(result.errors).toEqual([`${'66'.repeat(32)}:0: no Cauldron liquidity`])
    expect(h.store.deposits[0]?.amountPusd).toBe(500n)
    expect(h.store.deposits[0]?.swapError).toBe('no Cauldron liquidity')
  })

  it('reports unsupported tokens instead of silently dropping them', async () => {
    const txid = '77'.repeat(32)
    h.store.txs.set(
      txid,
      buildTx({
        inputs: [{ hash: 7 }],
        outputs: [{ sats: 1000n, lock: USER_LOCK, token: { category: 'bb'.repeat(32), amount: 9n } }],
      }),
    )
    h.store.history = [{ tx_hash: txid, height: 400 }]

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(0)
    expect(result.errors).toEqual([`${txid}:0: unsupported token ${'bb'.repeat(32)}`])
    expect(h.store.deposits).toHaveLength(0)
  })

  it('detects an unconfirmed deposit without crediting it yet', async () => {
    const txid = '99'.repeat(32)
    h.store.txs.set(
      txid,
      buildTx({
        inputs: [{ hash: 9 }],
        outputs: [{ sats: 250_000n, lock: USER_LOCK }],
      }),
    )
    h.store.history = [{ tx_hash: txid, height: 0 }]

    const result = await syncUserDeposits('user-1')

    expect(result.pendingDeposits).toBe(1)
    expect(result.newDeposits).toBe(0)
    expect(result.creditedPusd).toBe(0n)
    expect(h.store.users.get('user-1')).toBe(0n)
    expect(h.store.deposits[0]?.status).toBe('PENDING')
    expect(h.store.deposits[0]?.height).toBe(0)
    expect(h.store.swapCalls).toHaveLength(0)
  })

  it('credits a pending deposit once its transaction confirms', async () => {
    const txid = '9a'.repeat(32)
    addDeposit({
      txid,
      vout: 0,
      amountSats: 100_000n,
      amountPusd: 0n,
      status: 'PENDING',
      height: 0,
    })
    h.store.swap = async () => ({
      txid: '9b'.repeat(32),
      pusdReceived: 98n,
      satsSpent: 97_000n,
    })
    h.store.history = [{ tx_hash: txid, height: 123 }]

    const result = await syncUserDeposits('user-1')

    expect(result.newDeposits).toBe(1)
    expect(result.pendingDeposits).toBe(0)
    expect(result.creditedPusd).toBe(98n)
    expect(h.store.deposits[0]?.height).toBe(123)
    expect(h.store.deposits[0]?.status).toBe('CONFIRMED')
    expect(h.store.users.get('user-1')).toBe(98n)
  })

  it('settles a zero-value rounding deposit once without retrying forever', async () => {
    addDeposit({
      txid: '88'.repeat(32),
      vout: 0,
      amountSats: 500n,
      amountPusd: 0n,
      status: 'PENDING',
    })

    const first = await syncUserDeposits('user-1')
    expect(first.newDeposits).toBe(0)
    expect(h.store.deposits[0]?.status).toBe('CONFIRMED')
    expect(h.store.deposits[0]?.swapError).toContain('Below swap minimum')

    const second = await syncUserDeposits('user-1')
    expect(second.newDeposits).toBe(0)
    expect(h.store.users.get('user-1')).toBe(0n)
  })
})
