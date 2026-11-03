import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Fullstack probe: confirms the app and its server runtime are alive.
// Extend this pattern (or add server actions) instead of running a separate backend.
export function GET() {
  return NextResponse.json({
    ok: true,
    app: process.env.NEXT_PUBLIC_APP_NAME ?? 'toops',
    network: process.env.BCH_NETWORK ?? 'chipnet',
    timestamp: new Date().toISOString(),
  })
}
