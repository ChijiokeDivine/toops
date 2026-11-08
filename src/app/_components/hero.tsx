import Link from 'next/link'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { WalletIcon, TelegramIcon } from './icons'
import { LogoMark } from './logo'
import { TotalBets } from './total-bets'
import Image from 'next/image'

const SOCIALS = [
  // { label: 'Continue with Google', href: '#google', Icon: GoogleIcon },
  { label: 'Continue with Telegram', view: 'telegram' as const, Icon: TelegramIcon },
  { label: 'Continue with Wallet', view: 'wallet' as const, Icon: WalletIcon },
]

export function Hero() {
  return (
    <section className="hero-surface relative isolate flex flex-col items-center overflow-hidden rounded-[20px] px-4 pb-9 pt-[37px] text-center lg:h-72 lg:items-start lg:p-[38px] lg:text-left">
      {/* ── decoration ───────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* mobile: small dim mark, top right */}
        <LogoMark className="absolute right-10 top-6 h-5 w-auto opacity-40 lg:hidden" />
        {/* sparkles */}
        <span className="absolute left-[44%] top-[22%] h-1.5 w-1.5 rotate-45 bg-emerald-300/40 blur-[1px] lg:hidden" />
        <span className="absolute right-[18%] top-[34%] h-1.5 w-1.5 rotate-45 bg-emerald-300/30 blur-[1px] lg:hidden" />
        <span className="absolute left-[58%] top-[55%] h-1 w-1 rotate-45 bg-emerald-200/40 lg:hidden" />
        {/* desktop: big mark */}
        <Image
          src="/images/gamepad.png"
          alt="Toops"
          width={225}
          height={225}
          priority
          className="absolute right-[10%] top-1/2 hidden h-[225px] w-auto -translate-y-1/2  object-contain  lg:block"
        />
        {/* faint ghost marks */}
      </div>



      <div className="mt-5 flex w-full flex-col items-center lg:mt-auto lg:items-start">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight text-white lg:text-[34px]">
          This Is Your Kingdom
        </h1>

        <div className="mt-[27px] flex w-full flex-col items-center gap-3 lg:mt-7 lg:flex-row lg:gap-3">
          <Link
            href="/play"
            className="flex h-[43px] w-3/4 items-center justify-center rounded-xl bg-[var(--t-green)] text-base font-semibold text-[var(--t-green-ink)] shadow-[0_0_28px_rgba(0,250,127,0.25)] transition hover:brightness-110 active:scale-[0.98] lg:w-auto lg:px-5 lg:shadow-none"
          >
            Play Now
          </Link>

          <span className="hidden text-base font-semibold text-white lg:inline">or</span>

          <div className="flex items-center gap-1.5">
            {SOCIALS.map(({ label, view, Icon }) => (
              <AuthTrigger
                key={label}
                view={view}
                aria-label={label}
                className="flex h-[43px] w-[43px] cursor-pointer items-center justify-center rounded-[10px] bg-[#151c2b] text-white transition [--icon-cut:#151c2b] hover:bg-[#1e2739] hover:[--icon-cut:#1e2739]"
              >
                <Icon className="h-[22px] w-[22px]" />
              </AuthTrigger>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
