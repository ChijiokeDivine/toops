import Link from 'next/link'
import type { SVGProps } from 'react'
import Image from 'next/image'

/** Placeholder mark — swap the paths (or the whole component) for the real toops logo. */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden focusable={false} {...props}>
      <path d="M2 4 7 6.5V9l5 2.5L17 9V6.5L22 4v7l-10 5L2 11Z" fill="#4dffa3" />
      <path d="M2 12.6 12 17.6V27L2 22Z" fill="#00e070" />
      <path d="M22 12.6 12 17.6V27l10-5Z" fill="#00a85a" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link href="/" aria-label="toops home" className="flex items-center gap-1.5 lg:gap-2">
      <Image
        src="/images/logo.png"
        alt="toops"
        width={70}
        height={60}
        className="h-6 w-auto lg:h-12"
      />
    </Link>
  )
}
