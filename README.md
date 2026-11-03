# toops

Bitcoin Cash project for **BCH BLAZE 2026**, built on **chipnet** first.

Fullstack **Next.js 16** app (App Router) — UI, API routes, and server actions live in one project and deploy to Vercel as a single app. There is **no separate backend server**.

This repo is a scaffold only — dependencies, config, and folders are ready; no product code yet.

## Stack

| Layer               | Choice                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| App                 | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript                                                  |
| Styling             | Tailwind CSS v4 (PostCSS plugin)                                                                            |
| Wallet connection   | [WizardConnect](https://www.npmjs.com/package/@wizardconnect/react) (`@wizardconnect/react`)                |
| BCH smart contracts | [XO Stack](https://stack.xo.cash): `engine`, `templates`, `types`, `primitives`, `crypto`, `state`, `utils` |
| Covenant language   | [CashScript](https://cashscript.org) + `cashc` compiler                                                     |
| BCH primitives      | `@bitauth/libauth`                                                                                          |
| Tests               | Vitest + Testing Library + happy-dom                                                                        |
| Lint / format       | oxlint + Prettier                                                                                           |
| Hosting             | Vercel (one project, no external server)                                                                    |

## Requirements

- Node.js 20.9+ (tested with Node 22)
- pnpm 10+ (`npm install -g pnpm` or `corepack enable`)

## Getting started

```bash
pnpm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
pnpm dev
```

The app runs at http://localhost:3000. The health endpoint is at `/api/health`.

## Scripts

| Command                  | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `pnpm dev`               | Start the Next.js dev server (Turbopack)                   |
| `pnpm build`             | Production build + type check                              |
| `pnpm start`             | Serve the production build locally                         |
| `pnpm typecheck`         | Type-check only                                            |
| `pnpm lint`              | Run oxlint                                                 |
| `pnpm format`            | Format with Prettier                                       |
| `pnpm format:check`      | Check formatting in CI                                     |
| `pnpm test`              | Run tests once                                             |
| `pnpm test:watch`        | Run tests in watch mode                                    |
| `pnpm test:coverage`     | Run tests with coverage                                    |
| `pnpm contracts:compile` | Compile `contracts/main.cash` to `src/contracts/main.json` |

## Project structure

```text
toops/
├─ contracts/                 # CashScript sources (*.cash)
├─ src/
│  ├─ app/
│  │  ├─ api/health/route.ts  # API route (server-side)
│  │  ├─ layout.tsx           # Root layout + metadata
│  │  ├─ page.tsx             # Home page
│  │  ├─ globals.css          # Tailwind entry
│  │  └─ icon.svg             # Favicon
│  ├─ contracts/              # Compiled contract artifacts (output)
│  └─ test/                   # Vitest setup + tests
├─ .env.example               # Environment template
├─ next.config.ts             # Next config + server externals
├─ postcss.config.mjs         # Tailwind v4 via PostCSS
└─ vitest.config.ts           # Test config
```

Import from the source root with the `@` alias:

```ts
import { something } from '@/lib/something'
```

## Server vs client code

The BCH libraries expect a browser: WizardConnect uses `localStorage`/`WebSocket`, the XO engine uses IndexedDB and Electrum sockets. Keep them out of server components.

- Put wallet/engine components in files with `'use client'` at the top.
- If a component touches the engine on mount, load it with `dynamic(() => import('...'), { ssr: false })`.
- Keep API routes and server actions free of WalletConnect/XO imports unless you know the call is server-safe.
- Put server-only secrets in `.env.local` without the `NEXT_PUBLIC_` prefix.

## Backend inside the same app

No separate server is needed:

- **API routes:** `src/app/api/<name>/route.ts` (example: `api/health`).
- **Server actions:** functions marked `'use server'`, called directly from client components.
- **Server-only logic:** put it in `src/lib/server/` and import it only from routes/actions.

Anything that needs a long-running process (websocket server, background worker) is not a good fit for Vercel Functions — keep that logic client-side or on-chain.

## Network configuration

Development targets **chipnet**. Values live in `.env.local` (never committed):

```dotenv
NEXT_PUBLIC_BCH_NETWORK=chipnet
NEXT_PUBLIC_ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
BCH_NETWORK=chipnet
ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
```

Chipnet Electrum servers (WSS):

- `wss://chipnet.imaginary.cash:50004`
- `wss://chipnet.bch.ninja:50004`

Chipnet faucets:

- https://tbch.googol.cash
- https://chipnet.bch.ninja

Move to mainnet only at submission time, with minimal funds.

## Deploying to Vercel

1. Push the repo to GitHub/GitLab.
2. In Vercel: **Add New → Project → import the repo**.
3. Framework preset is detected as **Next.js**. Build command `pnpm build`, output handled automatically.
4. Add the environment variables from `.env.example` in **Project → Settings → Environment Variables**.
5. Deploy. The live URL is what you submit to BLAZE.

No separate server, database, or hosting provider is required for the scaffold. If you add a database later, use a Vercel Marketplace integration and keep the connection string server-only.

## BCH BLAZE checklist (Mainnet Track)

- [ ] At least one feature sends a real BCH **mainnet** transaction (chipnet while developing)
- [ ] WizardConnect **or** XO Template integration for wallet connection
- [ ] Live, clickable demo URL for judges
- [ ] Top-of-page banner with: presentation link (Widget Factory template), GitHub repo link, CashTokens address for EMBER2026 votes
- [ ] Original work (or clearly documented improvements over a pre-hackathon version)
- [ ] One team member attended a BLAZE stream (roll call) and checked in on Telegram

Widget Factory presentation template:
https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing

## Notes

- `@xo-cash/engine` is pinned to the `next` release (`0.1.0-next.*`) because the stack is in active development. Upgrade with `pnpm add @xo-cash/engine@next`.
- The other `@xo-cash/*` packages are pinned to the exact versions the engine expects. Upgrade them together with the engine to avoid duplicate/mismatched copies.
- `serverExternalPackages` in `next.config.ts` keeps native XO storage modules (`better-sqlite3`, `sqlite3`, `canvas`) out of server bundles. They are not needed for browser builds; approve them with `pnpm approve-builds` only if you use Node-side storage adapters.
- Next.js 16 generates `AGENTS.md` and `next-env.d.ts`; both are safe to keep.
- `.env.local` is gitignored; only `.env.example` is committed.
