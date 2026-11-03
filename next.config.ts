import { resolve } from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve('.'),
  },
  // Native modules pulled in by the XO storage layer must not be bundled
  // into server functions. They are only used by Node-side adapters.
  serverExternalPackages: ['better-sqlite3', 'sqlite3', 'canvas'],
}

export default nextConfig
