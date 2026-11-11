import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import './toops.css'
import { AuthDialog } from '@/components/auth/auth-dialog'
import { FloatingActions } from './_components/floating-actions'
import { MobileNav } from './_components/mobile-nav'
import { SiteHeader } from './_components/site-header'

const outfit = Outfit({ subsets: ['latin'], display: 'swap' })

const description = 'toops — a Bitcoin Cash project built for BCH BLAZE 2026.'
const ogImage = { url: '/images/og.png', width: 1200, height: 630, alt: 'toops' }

export const metadata: Metadata = {
  title: 'toops',
  description,
  openGraph: {
    title: 'toops',
    description,
    siteName: 'toops',
    type: 'website',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'toops',
    description,
    images: [ogImage.url],
  },
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
        <AuthDialog />
      </body>
    </html>
  )
}
