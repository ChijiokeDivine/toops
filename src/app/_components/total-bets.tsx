'use client'

import { useEffect, useState } from 'react'
import { CoinIcon } from './icons'

export function TotalBets({ initial = 13_505_462_856 }: { initial?: number }) {
  const [total, setTotal] = useState(initial)

  // Gentle live ticker. Replace with real data / websocket later.
  useEffect(() => {
    const id = setInterval(() => setTotal((v) => v + Math.floor(Math.random() * 7) + 1), 1100)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="inline-flex h-[35px] items-center gap-2 rounded-lg border border-[#ffdf1a]/25 bg-[#ffd60a]/10 pl-2.5 pr-3 backdrop-blur-[2px]">
      <CoinIcon className="h-[22px] w-[22px] shrink-0" />
      <span className="whitespace-nowrap text-base font-semibold leading-none text-[var(--t-gold)]">
        {total.toLocaleString('en-US')} Total Bets
      </span>
    </div>
  )
}
