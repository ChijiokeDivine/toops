import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  MIN_WITHDRAWAL_SATS,
  WithdrawalError,
  withdrawToLinkedWallet,
} from '@/lib/wallet/withdrawals'
import { PlatformWalletConfigError, platformWalletErrorMessage } from '@/lib/wallet/platform-wallet'
import { formatPusdUnits, parsePusdInput, pusdUnitsToSats, satsToPusdUnits } from '@/lib/pusd'
import { getPusdSatsPerPusd } from '@/lib/pusd-server'

export const runtime = 'nodejs'

function parseAmount(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return BigInt(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim())
  }
  return null
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { amountPusd, amountSats, address } = body as Record<string, unknown>
  const satsPerPusd = getPusdSatsPerPusd()

  let amount: bigint | null
  if (amountPusd !== undefined && amountPusd !== null) {
    const rawAmount =
      typeof amountPusd === 'string'
        ? amountPusd
        : typeof amountPusd === 'number'
          ? String(amountPusd)
          : null
    const units = rawAmount === null ? null : parsePusdInput(rawAmount)
    if (units === null) {
      return NextResponse.json(
        { error: 'A positive PUSD amount (at most 2 decimals) is required.' },
        { status: 400 },
      )
    }
    amount = pusdUnitsToSats(units, satsPerPusd)
  } else {
    // Backwards-compatible satoshi input for API clients written before PUSD.
    amount = parseAmount(amountSats)
    if (amount === null) {
      return NextResponse.json(
        { error: 'A positive PUSD amount is required.' },
        { status: 400 },
      )
    }
  }

  if (amount < MIN_WITHDRAWAL_SATS) {
    return NextResponse.json(
      {
        error: `Minimum withdrawal is ${formatPusdUnits(
          satsToPusdUnits(MIN_WITHDRAWAL_SATS, satsPerPusd),
        )} PUSD.`,
      },
      { status: 400 },
    )
  }

  try {
    const result = await withdrawToLinkedWallet({
      userId: session.userId,
      amountSats: amount,
      requestedAddress: typeof address === 'string' ? address : undefined,
    })

    return NextResponse.json({
      ok: true,
      id: result.id,
      txid: result.txid,
      amountSats: result.amountSats.toString(),
      feeSats: result.feeSats.toString(),
      amountPusd: formatPusdUnits(satsToPusdUnits(result.amountSats, satsPerPusd)),
      feePusd: formatPusdUnits(satsToPusdUnits(result.feeSats, satsPerPusd)),
      satsPerPusd: satsPerPusd.toString(),
    })
  } catch (error) {
    if (error instanceof WithdrawalError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof PlatformWalletConfigError) {
      return NextResponse.json({ error: platformWalletErrorMessage(error) }, { status: 503 })
    }
    console.error('withdrawal failed', error)
    return NextResponse.json({ error: 'Withdrawal failed.' }, { status: 500 })
  }
}
