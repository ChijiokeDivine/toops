# toops

Bitcoin Cash project for **BCH BLAZE 2026**, built on **chipnet** first.

Fullstack **Next.js 16** app (App Router) — UI, API routes, and server-side logic live in one project and deploy to Vercel as a single app. There is **no separate backend server**.

## Stack

| Layer               | Choice                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| App                 | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript                                                  |
| Styling             | Tailwind CSS v4 (PostCSS plugin)                                                                            |
| Database            | Postgres on Supabase + Prisma ORM 6                                                                         |
| Auth                | Telegram Login Widget + BCH wallet message signing (`bch-connect` / WalletConnect)                          |
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
pnpm db:deploy:local         # apply migrations to your Supabase database
pnpm dev
```

The app runs at http://localhost:3000. The health endpoint is at `/api/health`.

`pnpm install` runs `prisma generate` automatically through the `postinstall` script.

## Environment variables

`.env.local` is gitignored. Copy `.env.example` and fill in the values:

```dotenv
# Public: browser + server
NEXT_PUBLIC_BCH_NETWORK=chipnet
NEXT_PUBLIC_ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
NEXT_PUBLIC_APP_NAME=toops
NEXT_PUBLIC_WC_NETWORK=testnet
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
NEXT_PUBLIC_WC_PROJECT_ID=

# Server-only
BCH_NETWORK=chipnet
ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
TELEGRAM_BOT_TOKEN=
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
WALLET_ENCRYPTION_KEY=
```

### Database

Use the Supabase **transaction-mode pooler** (`:6543`, `?pgbouncer=true`) for `DATABASE_URL`, and the **session-mode pooler** (`:5432`) for `DIRECT_URL`, which Prisma uses for migrations.

### Telegram sign-in

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`).
2. Put the token in `TELEGRAM_BOT_TOKEN` and the bot username (without `@`) in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
3. Register the domain that serves the app with BotFather: `/setdomain`. The Login Widget refuses to embed on unregistered domains. For local development, use a tunnel (for example ngrok) or test on the deployed URL.

### BCH wallet sign-in

1. Create a project at [dashboard.reown.com](https://dashboard.reown.com).
2. Put the project ID in `NEXT_PUBLIC_WC_PROJECT_ID`.
3. Add your deployment origin to the Reown project's allowed domains.

Wallets that support WalletConnect v2 with BCH message signing work (Cashonize, Paytaca, ZapIt). The app is on chipnet, which uses the `bchtest:` address prefix, so `bch-connect` is configured with `NEXT_PUBLIC_WC_NETWORK=testnet`.

### Platform wallet encryption

Each user gets a platform wallet at signup. Its BIP39 mnemonic is encrypted at rest with AES-256-GCM using `WALLET_ENCRYPTION_KEY`.

Generate a key once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Keep this key safe and backed up.** Rotating or losing it makes existing wallet mnemonics unrecoverable. Use a different key per environment (local, preview, production).

## Authentication

- **Sessions:** random 32-byte tokens stored as SHA-256 hashes in the `Session` table, sent as an httpOnly, SameSite=Lax cookie (`toops_session`) for 30 days. Raw tokens are never stored.
- **Telegram:** the widget payload is verified server-side with HMAC-SHA256 using the bot token. Signatures older than 24 hours are rejected.
- **BCH wallet:** the server issues a single-use nonce challenge (10-minute TTL). The wallet signs a human-readable message, and the server recovers the public key with libauth and checks it against the address. Challenges are consumed atomically to prevent replay.
- **Platform wallet:** created on first sign-in if missing. Derived from a fresh BIP39 mnemonic at `m/44'/145'/0'/0/0`; only the address and public key are exposed to the client. The mnemonic is encrypted before it is stored.

Relevant code:

- `src/lib/auth/` — session, Telegram verification, user upserts.
- `src/lib/bch/` — address normalization and signed-message verification.
- `src/lib/wallet/platform-wallet.ts` — wallet generation and encryption.
- `src/app/api/auth/` — `telegram`, `bch/nonce`, `bch/verify`, `me`, `signout` routes.
- `src/components/auth/` — sign-in UI.

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
| `pnpm db:generate`       | Regenerate Prisma Client                                   |
| `pnpm db:migrate`        | Create/apply a dev migration against `.env.local`          |
| `pnpm db:deploy`         | Apply committed migrations (use on Vercel; reads env vars) |
| `pnpm db:deploy:local`   | Apply migrations using `.env.local`                        |
| `pnpm db:studio`         | Open Prisma Studio                                         |

## Project structure

```text
toops/
├─ contracts/                    # CashScript sources (*.cash)
├─ prisma/
│  ├─ schema.prisma              # User, PlatformWallet, Session, AuthChallenge
│  └─ migrations/                # Committed SQL migrations
├─ src/
│  ├─ app/
│  │  ├─ _components/            # Landing page UI (hero, game rows, header)
│  │  ├─ api/
│  │  │  ├─ auth/                # Telegram + BCH + session routes
│  │  │  └─ health/route.ts
│  │  ├─ layout.tsx              # Root layout + metadata
│  │  ├─ page.tsx                # Landing page + sign-in / account panel
│  │  ├─ globals.css             # Tailwind entry
│  │  └─ icon.svg                # Favicon
│  ├─ components/auth/           # Sign-in, sign-out, copy button
│  ├─ contracts/                 # Compiled contract artifacts (output)
│  ├─ lib/
│  │  ├─ auth/                   # Telegram, sessions, user upserts
│  │  ├─ bch/                    # Network, address, message verification
│  │  ├─ wallet/                 # Platform wallet generation/encryption
│  │  └─ db.ts                   # Prisma client singleton
│  └─ test/                      # Vitest setup + tests
├─ .env.example                  # Environment template
├─ next.config.ts                # Next config + server externals
├─ postcss.config.mjs            # Tailwind v4 via PostCSS
├─ prisma/schema.prisma
└─ vitest.config.ts              # Test config
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
- Server-only modules import `server-only` so an accidental client import fails at build time.

## Backend inside the same app

No separate server is needed:

- **API routes:** `src/app/api/<name>/route.ts` (example: `api/health`).
- **Server actions:** functions marked `'use server'`, called directly from client components.
- **Server-only logic:** put it in `src/lib/` and import it only from routes/actions.

Anything that needs a long-running process (websocket server, background worker) is not a good fit for Vercel Functions — keep that logic client-side or on-chain.

## Network configuration

Development targets **chipnet**. Values live in `.env.local` (never committed):

```dotenv
NEXT_PUBLIC_BCH_NETWORK=chipnet
NEXT_PUBLIC_ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
BCH_NETWORK=chipnet
ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
NEXT_PUBLIC_WC_NETWORK=testnet
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
3. Framework preset is detected as **Next.js**. Keep the default build command (`pnpm build`); `postinstall` generates Prisma Client.
4. Add every variable from `.env.example` in **Project → Settings → Environment Variables**. Use the Supabase pooler URLs and a production `WALLET_ENCRYPTION_KEY`.
5. Apply migrations. Either:
   - Set the build command to `pnpm db:deploy && pnpm build`, or
   - Run `pnpm db:deploy` once from a machine with the production `DATABASE_URL`/`DIRECT_URL` set.
6. Deploy. The live URL is what you submit to BLAZE.
7. Register the Vercel domain with BotFather (`/setdomain`) and Reown (allowed origins).

The database is hosted by Supabase; Vercel only runs the Next.js app and Prisma migrations. Keep `DATABASE_URL`, `DIRECT_URL`, `TELEGRAM_BOT_TOKEN`, and `WALLET_ENCRYPTION_KEY` server-only.

## Security notes

- **Custodial platform wallets.** The app holds encrypted mnemonics for users. This is acceptable for a chipnet hackathon demo, not for production funds. Before mainnet, move key custody to a KMS/HSM or MPC service, add withdrawal limits and auditing, and consider non-custodial user wallets instead.
- **Encryption key.** AES-256-GCM protects mnemonics at rest, but anyone with `WALLET_ENCRYPTION_KEY` and database access can decrypt them. Store the key in a secret manager (Vercel Environment Variables / Supabase Vault), restrict database access, and rotate deliberately.
- **Replay protection.** BCH challenges are single-use and expire after 10 minutes. Telegram payloads are rejected after 24 hours.
- **Cookies.** Session cookies are httpOnly, SameSite=Lax, and `Secure` in production.
- **Mainnet.** `BCH_NETWORK`/`NEXT_PUBLIC_WC_NETWORK` must be switched together, and the wallet address prefix changes from `bchtest:` to `bitcoincash:`.

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
- `serverExternalPackages` in `next.config.ts` keeps native XO storage modules (`better-sqlite3`, `sqlite3`, `canvas`) and `@prisma/client` out of server bundles.
- Next.js 16 generates `AGENTS.md` and `next-env.d.ts`; both are safe to keep.
- `.env.local` is gitignored; only `.env.example` is committed.
