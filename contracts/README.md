# contracts

CashScript sources for `toops` live here as `*.cash` files.

Compile a contract to a JSON artifact:

```bash
pnpm cashc contracts/main.cash -o src/contracts/main.json
```

or use the package script (expects `contracts/main.cash`):

```bash
pnpm contracts:compile
```

Useful resources:

- CashScript docs: https://cashscript.org/docs/
- CashScript playground: https://playground.cashscript.org/
- Bitauth IDE: https://ide.bitauth.com/
