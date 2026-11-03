import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'toops',
  description: 'toops — a Bitcoin Cash project built for BCH BLAZE 2026.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
