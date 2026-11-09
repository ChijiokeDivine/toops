import type { Metadata } from 'next'
import { DualGame } from '@/components/dual/dual-game'
import { DualRules } from '@/components/dual/dual-rules'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dual Crash — toops',
  description: 'Two-player PvP crash. Lock equal PUSD stakes, cash out last, take the pot.',
}

export default function DualPage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <DualGame />
      <DualRules />
    </main>
  )
}
