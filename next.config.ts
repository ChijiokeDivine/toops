import { resolve } from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve('.'),
  },
  // Native modules pulled in by the XO storage layer must not be bundled
  // into server functions. They are only used by Node-side adapters.
  // The Prisma engine is a native binary and must stay external on Vercel.
  serverExternalPackages: ['better-sqlite3', 'sqlite3', 'canvas', '@prisma/client'],
}

export default nextConfig
