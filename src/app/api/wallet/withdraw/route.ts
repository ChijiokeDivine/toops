import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  MIN_WITHDRAWAL_SATS,
  WithdrawalError,
  withdrawToLinkedWallet,
} from '@/lib/wallet/withdrawals'
import { PlatformWalletConfigError, platformWalletErrorMessage } from '@/lib/wallet/platform-wallet'

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

  const { amountSats, address } = body as Record<string, unknown>
  const amount = parseAmount(amountSats)
  if (amount === null) {
    return NextResponse.json({ error: 'A positive satoshi amount is required.' }, { status: 400 })
  }
  if (amount < MIN_WITHDRAWAL_SATS) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${MIN_WITHDRAWAL_SATS} sats.` },
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
