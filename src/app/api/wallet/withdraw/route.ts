import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { formatPusdUnits, parsePayoutAsset, parsePusdInput } from '@/lib/pusd'
import { WithdrawalError, withdraw } from '@/lib/wallet/withdrawals'
import { PlatformWalletConfigError, platformWalletErrorMessage } from '@/lib/wallet/platform-wallet'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { amountPusd, payoutAsset: rawPayoutAsset, address } = body as Record<string, unknown>

  const amountInput =
    typeof amountPusd === 'string'
      ? amountPusd
      : typeof amountPusd === 'number'
        ? String(amountPusd)
        : null
  const amount = amountInput === null ? null : parsePusdInput(amountInput)
  if (amount === null) {
    return NextResponse.json(
      { error: 'A positive PUSD amount (at most 2 decimals) is required.' },
      { status: 400 },
    )
  }

  const payoutAsset = parsePayoutAsset(rawPayoutAsset)
  if (!payoutAsset) {
    return NextResponse.json({ error: 'Choose a payout asset: PUSD or BCH.' }, { status: 400 })
  }

  try {
    const result = await withdraw({
      userId: session.userId,
      amountPusd: amount,
      payoutAsset,
      requestedAddress: typeof address === 'string' ? address : undefined,
    })

    return NextResponse.json({
      ok: true,
      id: result.id,
      txid: result.txid,
      payoutAsset: result.payoutAsset,
      amountPusd: formatPusdUnits(result.amountPusd),
      feePusd: formatPusdUnits(result.feePusd),
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
