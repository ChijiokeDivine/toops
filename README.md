# toops

Bitcoin Cash project for **BCH BLAZE 2026**, built on **chipnet** first.

Fullstack **Next.js 16** app (App Router) — UI, API routes, and server-side logic live in one project and deploy to Vercel as a single app. There is **no separate backend server**.

## Stack

| Layer               | Choice                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| App                 | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript                                                  |
| Styling             | Tailwind CSS v4 (PostCSS plugin)                                                                            |
| Database            | Postgres on Supabase + Prisma ORM 6                                                                         |
| Auth                | Telegram Login Widget + WizardConnect transaction challenge (no Reown / WalletConnect project ID)           |
| Wallet connection   | [WizardConnect](https://www.npmjs.com/package/@wizardconnect/react) (`@wizardconnect/react`)                |
| Custody             | HD platform wallets (`m/44'/145'/0'/0/<index>`); xpriv in env/Infisical, XPUB + public addresses in the DB  |
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
NEXT_PUBLIC_APP_NAME=toops
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=

# Server-only
BCH_NETWORK=chipnet
ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
TELEGRAM_BOT_TOKEN=
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connect_timeout=15"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
PLATFORM_WALLET_XPRIV=
PLATFORM_WALLET_XPUB=
WITHDRAWAL_FEE_SATS=1000
PUSD_TOKEN_ID=
PUSD_DECIMALS=2
PUSD_DUST_SATS=1000
PARYON_API_URL=
BCH_USD_PRICE=
MIN_WITHDRAWAL_PUSD=1
CRON_SECRET=
```

### Database

Use the Supabase **transaction-mode pooler** (`:6543`, `?pgbouncer=true&connect_timeout=15`) for `DATABASE_URL`, and the **session-mode pooler** (`:5432`) for `DIRECT_URL`, which Prisma uses for migrations. The longer connect timeout avoids transient `P1001` errors while Supabase resumes a pooled connection.

The HD wallet migration creates `platform_wallet_index_seq`, a Postgres sequence that hands out unique derivation indexes atomically. If you add users while the sequence does not exist, wallet creation fails — apply migrations first.

### Telegram sign-in

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`).
2. Put the token in `TELEGRAM_BOT_TOKEN` and the bot username (without `@`) in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
3. Register the domain that serves the app with BotFather: `/setdomain`. The Login Widget refuses to embed on unregistered domains. For local development, use a tunnel (for example ngrok) or test on the deployed URL.

### WizardConnect wallet sign-in

No Reown project ID is required. WizardConnect pairs the dapp with the wallet over its own relay and the QR code/URI is generated in the browser.

1. Open the app and click **Connect BCH wallet**.
2. Scan the QR code with a WizardConnect-compatible wallet (Cashonize, Paytaca, ZapIt) on chipnet.
3. The app asks the wallet to sign a **synthetic challenge transaction**. The transaction spends a fake outpoint derived from a server nonce, so it cannot move funds.
4. The server verifies the DER signature and the claimed P2PKH address with libauth. The challenge is single-use and expires after 10 minutes.

Wallet ownership is proven by the transaction signature because WizardConnect does not expose message signing.

### HD platform wallet (3-layer custody)

Every user gets a unique deposit address derived from one platform master key:

```
m/44'/145'/0' / 0 / <derivationIndex>
       account   receive
```

- **Layer 1 — master secret.** `PLATFORM_WALLET_XPRIV` lives only in the deployment environment (Vercel env vars, Infisical, or similar). It is never written to Postgres and never sent to the browser. `PLATFORM_WALLET_XPRIV` may be the root key (depth 0) or the account key (depth 3).
- **Layer 2 — public key material.** `PLATFORM_WALLET_XPUB` (account-level, depth 3) can derive receiving addresses but cannot spend. The database stores only `address` and `derivationIndex` on `PlatformWallet`.
- **Layer 3 — signing.** Only `POST /api/wallet/withdraw` derives the private key for the user's index, in memory, signs the payout P2PKH transaction, and then drops the reference. Nothing is persisted or logged.

Generate a chipnet key pair once and store the xpriv in your secret manager:

```bash
node -e "import('@bitauth/libauth').then(m => {
  const root = m.deriveHdPrivateNodeFromBip39Mnemonic(m.generateBip39Mnemonic())
  const account = m.deriveHdPath(root, \"m/44'/145'/0'\")
  console.log('PLATFORM_WALLET_XPRIV=' + m.encodeHdPrivateKey({ node: root, network: 'testnet' }).hdPrivateKey)
  console.log('PLATFORM_WALLET_XPUB=' + m.encodeHdPublicKey({ node: m.deriveHdPublicNode(account), network: 'testnet' }).hdPublicKey)
})"
```

> **Back up the master key.** Losing it makes every platform deposit address unspendable. Never reuse the chipnet key on mainnet; generate a fresh mainnet pair (xprv/xpub) before launch.

### PUSD ledger

Balances are denominated in **PUSD** (ParyonUSD), a 2-decimal CashToken on BCH. Users never see the underlying BCH balance: BCH is only the settlement/fee asset.

- **Live chipnet token:** deployment `chipnet-16`, category `dfe50223c8d5cba8dcef8dff6d92b61deb88a8ba44947367f2b746487b56039b`. On mainnet the default category is `2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544`. Override with `PUSD_TOKEN_ID`.
- **Rate source:** the Paryon oracle/stats API (`PARYON_API_URL`, default `https://chipnet-16.paryonusd.com`) supplies `bchUsdPrice`; the app derives `satsPerPusd`. `BCH_USD_PRICE` is an optional offline fallback.
- **Ledger fields:** `User.balancePusd`, `Deposit.amountPusd`/`swapTxid`, `Withdrawal.amountPusd`/`feePusd`/`payoutAsset`, and `LedgerEntry.amountPusd`/`balanceAfterPusd`, all in PUSD base units. Legacy satoshi columns are retained but deprecated.
- **Unit helpers:** `src/lib/pusd.ts` (pure, client-safe) and `src/lib/pusd-server.ts` (token config + oracle).

### Deposits and withdrawals

- **PUSD deposits:** send PUSD to the user's deposit address (token-aware P2PKH). `POST /api/wallet/sync` detects the fungible token outputs for the configured category and credits them 1:1.
- **BCH deposits:** BCH sent to the same address is swapped to PUSD through **Cauldron** (`@mr-zwets/cauldron-swap-sdk`) before crediting. Deposits below `MIN_SWAP_SATS` (50,000 sats) are credited at the oracle rate and retained as the BCH payout reserve. Swaps only move funds already received at the platform deposit address.
- **Sync:** `POST /api/wallet/sync` scans the signed-in user's address over Electrum WSS (`blockchain.scripthash.get_history` + `blockchain.transaction.get`), credits confirmed outputs, and appends a `LedgerEntry`. The unique `(txid, vout)` index makes the credit idempotent.
- **Bulk sync:** `GET /api/cron/sync-deposits` scans a batch of wallets. Protect it with `CRON_SECRET` (`Authorization: Bearer <secret>` or `x-cron-secret`), and schedule it with Vercel Cron.
- **Withdrawals:** `POST /api/wallet/withdraw` takes `{ amountPusd, payoutAsset }`, where `payoutAsset` is `PUSD` (CashToken transfer) or `BCH` (converted at the oracle rate and paid from the BCH reserve). It can only pay the wallet address linked to the account. The PUSD amount plus fee is reserved with a conditional decrement before broadcast and refunded if the broadcast fails.
- **Minimum / fee:** `MIN_WITHDRAWAL_PUSD` (default `1`) sets the minimum. `WITHDRAWAL_FEE_SATS` sets the BCH network-fee floor; the builder raises it when the estimated transaction size requires more, and the equivalent is charged in PUSD.

### XP and daily check-ins

XP is off-chain account progress and has nothing to do with the BCH balance.

- **Claim:** `POST /api/xp/claim` requires a session. Each user can claim once per UTC day.
- **Reward:** 100 XP for the first day, +25 XP per consecutive day, capped at +150 XP bonus (day 7 and beyond).
- **Persistence:** `User.xp`, `User.xpStreak`, and `User.xpLastClaimedAt` hold the running totals; every claim appends an `XpClaim` row.
- **Anti-double-claim:** the unique `(userId, dayKey)` index on `XpClaim` is the database-level guard, so concurrent requests cannot claim twice.
- **Levels:** every 500 XP is a new level. The `/xp` page shows the current level, streak, claim button, countdown to the next UTC midnight, and claim history.
- **Missing a day:** a gap of more than one UTC day resets the streak to day one on the next claim.

Relevant code:

- `src/lib/xp.ts` — claim rules, streak/level math, and summary queries.
- `src/app/api/xp/claim/route.ts` — authenticated claim endpoint.
- `src/app/xp/page.tsx` — signed-in dashboard and signed-out prompt.
- `src/components/xp/xp-claim-card.tsx` — claim button and live countdown.
- `src/components/account/account-nav.tsx` — header XP, notifications, and profile menu.

## Authentication

- **Sessions:** random 32-byte tokens stored as SHA-256 hashes in the `Session` table, sent as an httpOnly, SameSite=Lax cookie (`toops_session`) for 30 days. Raw tokens are never stored.
- **Telegram:** the widget payload is verified server-side with HMAC-SHA256 using the bot token. Signatures older than 24 hours are rejected.
- **BCH wallet:** the server issues a single-use challenge transaction (10-minute TTL). The wallet signs it with the receive-path key, and the server verifies the signature against the challenge template and the claimed address. Challenges are consumed atomically to prevent replay; expired rows are purged on the next challenge request and by the cron sync.
- **Payout wallet linking:** a signed-in user can attach a wallet address through the same challenge flow; the address is stored on `User.bchAddress` and is the only valid withdrawal destination.
- **Platform wallet:** created on first sign-in if missing. The BIP44 index comes from the Postgres sequence; only the public address is stored.

Relevant code:

- `src/lib/auth/` — sessions, Telegram verification, user upserts, wallet challenges.
- `src/lib/bch/` — network, address normalization, Electrum client, challenge transaction verification.
- `src/lib/wallet/platform-wallet.ts` — HD address/key derivation and sequence allocation.
- `src/lib/wallet/deposits.ts` — deposit scanning and idempotent crediting.
- `src/lib/wallet/withdrawals.ts` — UTXO selection, signing, reservation, broadcast.
- `src/app/api/auth/` — `telegram`, `wallet/challenge`, `wallet/verify`, `me`, `signout`.
- `src/app/api/wallet/` — `route`, `link`, `sync`, `withdraw`.
- `src/app/api/cron/sync-deposits` — protected bulk deposit sync.
- `src/components/auth/` — sign-in UI, WizardConnect pairing, account wallet panel.

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
│  ├─ schema.prisma              # User, PlatformWallet, Session, AuthChallenge, Deposit, Withdrawal, LedgerEntry
│  └─ migrations/                # Committed SQL migrations
├─ src/
│  ├─ app/
│  │  ├─ _components/            # Landing page UI (hero, game rows, header)
│  │  ├─ api/
│  │  │  ├─ auth/                # Telegram, wallet challenge/verify, session routes
│  │  │  ├─ wallet/              # Summary, link, sync, withdraw
│  │  │  ├─ cron/                # Protected bulk deposit sync
│  │  │  └─ health/route.ts
│  │  ├─ layout.tsx              # Root layout + metadata
│  │  ├─ page.tsx                # Landing page + sign-in / account panel
│  │  ├─ globals.css             # Tailwind entry
│  │  └─ icon.svg                # Favicon
│  ├─ components/auth/           # Sign-in, WizardConnect, account wallet panel
│  ├─ contracts/                 # Compiled contract artifacts (output)
│  ├─ lib/
│  │  ├─ auth/                   # Telegram, sessions, user upserts, challenges
│  │  ├─ bch/                    # Network, address, Electrum, challenge verification
│  │  ├─ wallet/                 # HD derivation, deposits, withdrawals
│  │  └─ db.ts                   # Prisma client singleton
│  └─ test/                      # Vitest setup + helpers
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

The BCH libraries have different runtime expectations: WizardConnect uses `localStorage`/`WebSocket`, the XO engine uses IndexedDB and Electrum sockets. Keep them out of server components.

- Put wallet/engine components in files with `'use client'` at the top.
- If a component touches the engine on mount, load it with `dynamic(() => import('...'), { ssr: false })`.
- Use `ELECTRUM_WSS_URL` only from server routes; the server Electrum client relies on Node's global `WebSocket` (Node 22).
- Put server-only secrets in `.env.local` without the `NEXT_PUBLIC_` prefix.
- Server-only modules import `server-only` so an accidental client import fails at build time.

## Backend inside the same app

No separate server is needed:

- **API routes:** `src/app/api/<name>/route.ts` (example: `api/health`).
- **Server actions:** functions marked `'use server'`, called directly from client components.
- **Server-only logic:** put it in `src/lib/` and import it only from routes/actions.
- **Scheduled work:** Vercel Cron calls `GET /api/cron/sync-deposits` with `CRON_SECRET`.

Anything that needs a long-running process (websocket server, background worker) is not a good fit for Vercel Functions — keep that logic client-side or on-chain.

## Network configuration

Development targets **chipnet**. Values live in `.env.local` (never committed):

```dotenv
NEXT_PUBLIC_BCH_NETWORK=chipnet
BCH_NETWORK=chipnet
ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
```

Chipnet Electrum servers (WSS):

- `wss://chipnet.imaginary.cash:50004`
- `wss://chipnet.bch.ninja:50004`

Chipnet faucets:

- https://tbch.googol.cash
- https://chipnet.bch.ninja

Move to mainnet only at submission time, with minimal funds. Switching networks requires new mainnet `PLATFORM_WALLET_XPRIV`/`XPUB`, plus `BCH_NETWORK=mainnet`.

## Deploying to Vercel

1. Push the repo to GitHub/GitLab.
2. In Vercel: **Add New → Project → import the repo**.
3. Framework preset is detected as **Next.js**. Keep the default build command (`pnpm build`); `postinstall` generates Prisma Client.
4. Add every variable from `.env.example` in **Project → Settings → Environment Variables**. Store `PLATFORM_WALLET_XPRIV` (and `CRON_SECRET`) in Vercel's encrypted env vars or Infisical, never in the repo.
5. Apply migrations. Either:
   - Set the build command to `pnpm db:deploy && pnpm build`, or
   - Run `pnpm db:deploy` once from a machine with the production `DATABASE_URL`/`DIRECT_URL` set.
6. Deploy. The live URL is what you submit to BLAZE.
7. Register the Vercel domain with BotFather (`/setdomain`). No Reown project is needed.
8. Add a Vercel Cron entry for `GET /api/cron/sync-deposits` (for example every 5 minutes) with the `CRON_SECRET` header.

The database is hosted by Supabase; Vercel only runs the Next.js app and Prisma migrations. Keep `DATABASE_URL`, `DIRECT_URL`, `TELEGRAM_BOT_TOKEN`, `PLATFORM_WALLET_XPRIV`, and `CRON_SECRET` server-only.

## Security notes

- **Custodial platform wallets.** The app holds the master xpriv in its environment and signs withdrawals for users. This is acceptable for a chipnet hackathon demo, not for production funds. Before mainnet, move key custody to a KMS/HSM or MPC service, add withdrawal limits, rate limiting, and auditing.
- **Master key separation.** The database leak exposes only public addresses and balances. The xpriv stays in the deployment secret manager; the optional XPUB can derive addresses but cannot spend.
- **Replay protection.** Wallet challenges are single-use transactions and expire after 10 minutes. Telegram payloads are rejected after 24 hours.
- **Payout allowlist.** Withdrawals refuse any destination other than `User.bchAddress`, and the balance is reserved atomically before broadcast.
- **Cookies.** Session cookies are httpOnly, SameSite=Lax, and `Secure` in production.
- **Mainnet.** `BCH_NETWORK` changes the address prefix from `bchtest:` to `bitcoincash:`. Generate fresh mainnet keys and re-run migrations before launch.

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
