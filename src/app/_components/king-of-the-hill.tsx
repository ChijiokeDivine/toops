import Link from 'next/link'
import { CrownIcon } from './icons'

export function KingOfTheHill({ prize = '$45k' }: { prize?: string }) {
  return (
    <Link
      href="/king-of-the-hill"
      aria-label={`King of the Hill — ${prize}`}
      className="relative mr-7 hidden flex-col items-center leading-none transition hover:brightness-125 lg:flex"
    >
      <CrownIcon className="mb-0.5 h-[18px] w-auto text-[#ffc61a] drop-shadow-[0_0_8px_rgba(255,198,26,0.5)]" />
      <span className="koth-gold text-[13px] font-black uppercase tracking-tight">
        King <span className="text-[8px]">of the</span> Hill
      </span>
      <span className="koth-gold -mt-px text-[21px] font-black tracking-tight">{prize}</span>
      <span
        aria-hidden
        className="absolute -bottom-3 h-px w-[130%] bg-gradient-to-r from-transparent via-[#ffc61a]/30 to-transparent"
      />
    </Link>
  )
}
