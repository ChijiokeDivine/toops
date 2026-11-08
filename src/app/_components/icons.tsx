import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const a11y = { 'aria-hidden': true, focusable: false } as const

/* ── Navigation / UI ─────────────────────────────────── */

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...a11y} {...props}>
      <path
        d="M4 6.5h16M4 12h16M4 17.5h16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...a11y} {...props}>
      <circle cx="10.5" cy="10.5" r="6.8" stroke="currentColor" strokeWidth="2.2" />
      <path d="m16 16 4.6 4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function CasinoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="currentColor" />
      <path
        d="M12 6.6c-2.1 2.3-3.9 3.6-3.9 5.3 0 1.2.9 2 2 2 .6 0 1.2-.3 1.6-.8-.1 1-.4 1.8-1 2.4h2.6c-.6-.6-.9-1.4-1-2.4.4.5 1 .8 1.6.8 1.1 0 2-.8 2-2 0-1.7-1.8-3-3.9-5.3Z"
        fill="var(--icon-cut, var(--t-bg))"
      />
    </svg>
  )
}

export function SportsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <g stroke="var(--icon-cut, var(--t-bg))" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M12 2v20M2 12h20" />
        <path d="M5.2 4.8c3.4 3.2 3.4 11.2 0 14.4" />
        <path d="M18.8 4.8c-3.4 3.2-3.4 11.2 0 14.4" />
      </g>
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
    </svg>
  )
}

export function ChartUpIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M3.5 20.5h17M5.5 16l5-5 3.5 3.5 5.5-7" />
      <path d="M15.5 7.5h4v4" />
    </svg>
  )
}

export function GiftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <rect x="3" y="8" width="18" height="4.5" rx="1.4" fill="currentColor" />
      <rect x="4.5" y="13.5" width="15" height="8" rx="1.6" fill="currentColor" />
      <path d="M12 8v13.5" stroke="var(--icon-cut, var(--t-bg))" strokeWidth="1.8" />
      <path
        d="M12 8C9.5 8 7.5 7 7.5 5.2 7.5 3.8 8.5 3 9.7 3 11.2 3 12 5 12 8Zm0 0c2.5 0 4.5-1 4.5-2.8C16.5 3.8 15.5 3 14.3 3 12.8 3 12 5 12 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        d="M12 3C6.8 3 3 6.5 3 11c0 2.2.9 4.1 2.4 5.5L4.5 21l4.4-1.9c.9.2 1.9.4 3.1.4 5.2 0 9-3.5 9-8s-3.8-8.5-9-8.5Z"
        fill="currentColor"
      />
      <g fill="var(--icon-cut, var(--t-bg))">
        <circle cx="8.1" cy="11.4" r="1.25" />
        <circle cx="12" cy="11.4" r="1.25" />
        <circle cx="15.9" cy="11.4" r="1.25" />
      </g>
    </svg>
  )
}

export function HeadsetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...a11y} {...props}>
      <path
        d="M4.5 14v-2.5a7.5 7.5 0 0 1 15 0V14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="3" y="12.5" width="4.4" height="7" rx="2" fill="currentColor" />
      <rect x="16.6" y="12.5" width="4.4" height="7" rx="2" fill="currentColor" />
      <path
        d="M19 19.5c0 1.5-1.7 2-4 2h-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ArrowIcon({ direction, ...props }: IconProps & { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        d={direction === 'left' ? 'M16 6.2v11.6L7.4 12 16 6.2Z' : 'M8 6.2v11.6l8.6-5.8L8 6.2Z'}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...a11y} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="9.5" r="1.8" fill="currentColor" />
      <path
        d="m4 17 5-4.5 3.5 3L16 12l4 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ── Social login ────────────────────────────────────── */

export function GoogleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      />
    </svg>
  )
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M21.8 3.3 2.4 10.8c-1 .4-1 1.3-.2 1.5l4.9 1.5 1.9 5.9c.2.6.9.7 1.3.3l2.7-2.6 5.1 3.8c.9.5 1.5.2 1.7-.9L23.2 4.7c.3-1.3-.5-1.9-1.4-1.4ZM9.2 13.4 18 7.6l-7 6.6-.3 3.4-1.5-4.2Z"
      />
    </svg>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" />
      <circle cx="18" cy="14" r="0.5" fill="currentColor" />
    </svg>
  )
}

/* ── Brand bits ──────────────────────────────────────── */

export function CoinIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <circle cx="12" cy="12" r="11" fill="#f5b800" />
      <circle cx="12" cy="12" r="9.2" fill="#ffd633" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#c98a00" strokeWidth="1.2" />
      <path
        d="M8.6 15.4v-4.2l1.6-1v-1.5l1.8 1 1.8-1v1.5l1.6 1v4.2l-3.4 1.9-3.4-1.9Z"
        fill="#c98a00"
      />
    </svg>
  )
}

export function CrownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 22" {...a11y} {...props}>
      <path d="M3 19 1.6 6.2l5.9 4.6L12 2.5l4.5 8.3 5.9-4.6L21 19H3Z" fill="currentColor" />
    </svg>
  )
}

/* ── Account / XP ────────────────────────────────────── */

export function XpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        d="M13.4 2.2 5.2 13.1c-.4.5 0 1.2.6 1.2h4.4l-1.3 7.2c-.1.7.7 1.1 1.2.6l8.4-11c.4-.5 0-1.2-.6-1.2h-4.6l1.2-7c.1-.7-.7-1.1-1.1-.7Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M18 8.6a6 6 0 0 0-12 0c0 4.2-1.4 5.6-2 6.4h16c-.6-.8-2-2.2-2-6.4Z" />
      <path d="M9.7 18.4a2.5 2.5 0 0 0 4.6 0" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...a11y} {...props}>
      <path
        d="m6.5 9.5 5.5 5.5 5.5-5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.2c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6" />
    </svg>
  )
}

export function TransactionsIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M4 8h13.5M14 4.5 17.5 8 14 11.5" />
      <path d="M20 16H6.5M10 12.5 6.5 16l3.5 3.5" />
    </svg>
  )
}

export function TicketIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M3.5 8.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6V8.5Z" />
      <path d="M12 7.2v1.6M12 11.2v1.6M12 15.2v1.6" strokeDasharray="0.1 3" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.6-1.2-1.8-3.1-1.9.8a7.7 7.7 0 0 0-2.6-1.5L14.4 3h-3.6l-.3 2.5A7.7 7.7 0 0 0 8 7l-1.9-.8-1.8 3.1L5.9 10.5a7.6 7.6 0 0 0 0 3L4.3 14.7l1.8 3.1 1.9-.8a7.7 7.7 0 0 0 2.5 1.5l.3 2.5h3.6l.3-2.5a7.7 7.7 0 0 0 2.6-1.5l1.9.8 1.8-3.1-1.6-1.2Z" />
    </svg>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M14.5 4.5h-8a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8" />
      <path d="M17.5 8.5 21 12l-3.5 3.5M10 12h11" />
    </svg>
  )
}

/* ── Profile ─────────────────────────────────────────── */

export function LockIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15.3" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M10 13.5a4.2 4.2 0 0 0 6 0l2.4-2.4a4.2 4.2 0 0 0-6-6L11.2 6.3" />
      <path d="M14 10.5a4.2 4.2 0 0 0-6 0l-2.4 2.4a4.2 4.2 0 0 0 6 6l1.2-1.2" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.4 19.4c.5-3.2 2.9-4.9 5.6-4.9s5.1 1.7 5.6 4.9" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.6 14.7c2 .5 3.3 2.1 3.6 4.3" />
    </svg>
  )
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <path
        d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9L12 2.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...props}
    >
      <path d="M12 16V4.5M8 8l4-3.5L16 8" />
      <path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
    </svg>
  )
}

/* ── Brand marks ─────────────────────────────────────── */

const STAR_POINTS = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 === 0 ? 12 : 9.7
  const angle = (Math.PI * 2 * i) / 24 - Math.PI / 2
  return `${(12 + r * Math.cos(angle)).toFixed(2)},${(12 + r * Math.sin(angle)).toFixed(2)}`
}).join(' ')

export function OriginalsBadgeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...a11y} {...props}>
      <polygon
        points={STAR_POINTS}
        fill="#8a3df0"
        stroke="#c79bff"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 12.6 10.4 15.8 17.2 8.4"
        fill="none"
        stroke="#1a0a3a"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 12.6 10.4 15.8 17.2 8.4"
        fill="none"
        stroke="#8dff3c"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
