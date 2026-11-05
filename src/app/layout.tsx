import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import './toops.css'
import { FloatingActions } from './_components/floating-actions'
import { MobileNav } from './_components/mobile-nav'
import { SiteHeader } from './_components/site-header'

const outfit = Outfit({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'toops',
  description: 'toops — a Bitcoin Cash project built for BCH BLAZE 2026.',
}

export const viewport: Viewport = {
  themeColor: '#080d17',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} min-h-dvh bg-[var(--t-bg)] text-slate-100 antialiased`}>
        <SiteHeader />
        {children}
        <MobileNav />
        <FloatingActions />
      </body>
    </html>
  )
}
