# toops

Bitcoin Cash project for **BCH BLAZE 2026**, built on **chipnet** first.

This repo is a scaffold only — dependencies, config, and folders are ready; no product code yet.

## Stack

| Layer               | Choice                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| App                 | React 19 + TypeScript + Vite 8                                                                              |
| Styling             | Tailwind CSS v4                                                                                             |
| Wallet connection   | [WizardConnect](https://www.npmjs.com/package/@wizardconnect/react) (`@wizardconnect/react`)                |
| BCH smart contracts | [XO Stack](https://stack.xo.cash): `engine`, `templates`, `types`, `primitives`, `crypto`, `state`, `utils` |
| Covenant language   | [CashScript](https://cashscript.org) + `cashc` compiler                                                     |
| BCH primitives      | `@bitauth/libauth`                                                                                          |
| Tests               | Vitest + Testing Library + jsdom                                                                            |
| Lint / format       | oxlint + Prettier                                                                                           |

## Requirements

- Node.js 20+ (tested with Node 22)
- pnpm 10+ (`npm install -g pnpm` or `corepack enable`)

## Getting started

```bash
pnpm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
pnpm dev
```

The app runs at http://localhost:5173.

## Scripts

| Command                  | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `pnpm dev`               | Start the Vite dev server                                  |
| `pnpm build`             | Type-check and build for production                        |
| `pnpm preview`           | Serve the production build locally                         |
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
├─ contracts/            # CashScript sources (*.cash)
├─ public/               # Static assets
├─ src/
│  ├─ App.tsx            # Placeholder screen
│  ├─ main.tsx           # React entry point
│  ├─ index.css          # Tailwind entry
│  ├─ contracts/         # Compiled contract artifacts (output)
│  └─ test/setup.ts      # Vitest setup
├─ .env.example          # Environment template
├─ vite.config.ts        # Vite + Tailwind + `@` alias
└─ vitest.config.ts      # Test config
```

Import from the source root with the `@` alias:

```ts
import { something } from '@/lib/something'
```

## Network configuration

Development targets **chipnet**. Values live in `.env.local` (never committed):

```dotenv
VITE_BCH_NETWORK=chipnet
VITE_ELECTRUM_WSS_URL=wss://chipnet.imaginary.cash:50004
```

Chipnet Electrum servers (WSS):

- `wss://chipnet.imaginary.cash:50004`
- `wss://chipnet.bch.ninja:50004`

Chipnet faucets:

- https://tbch.googol.cash
- https://chipnet.bch.ninja

Move to mainnet only at submission time, with minimal funds.

## BCH BLAZE checklist (Mainnet Track)

Keep these in mind as the app is built:

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
- pnpm may warn about ignored build scripts for `better-sqlite3`, `sqlite3`, and `canvas` (transitive dependencies of the XO/storage stack). They are not needed for browser builds; approve them only if you start using the Node-side storage adapters (`pnpm approve-builds`).
- `.env.local` is gitignored; only `.env.example` is committed.
