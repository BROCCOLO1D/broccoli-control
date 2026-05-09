# Broccoli Control

Broccoli Control is a production-looking wallet QA fixture for `brocolli-test`: a Next.js frontend, wagmi/viem wallet surface, and a Foundry ERC20 contract called **Broccoli Control Token** (`BROC`). The interface intentionally uses a restrained black/white/gray system with broccoli-green accents so automation state is obvious without turning the fixture into a toy app.

![Broccoli Control running locally](docs/assets/readme/broccoli-control-local.png)

## Why this repo exists

Wallet QA needs a stable downstream dapp that behaves like a real product surface while staying simple enough to reason about. This repo owns:

- app routes, copy, visual states, and stable `data-testid` selectors;
- ERC20 read/write flows used by injected wallet tests;
- Foundry deployment scripts and contract tests;
- public-safe documentation for local QA and Sepolia deployments.

Reusable wallet/browser behavior belongs in `@broccolo1d/playwright` and `@broccolo1d/wallet-browser`.

## Stack

- **Frontend:** Next.js App Router, React, TypeScript
- **Wallet:** wagmi, viem, TanStack Query
- **Contracts:** Solidity, Foundry, OpenZeppelin ERC20/Ownable
- **Tests:** ESLint, Next build, Playwright wallet QA, Forge tests
- **Default network:** Sepolia (`11155111`)

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000 and connect an injected browser wallet. With the default zero token address the app renders safely but disables transfers. Set `NEXT_PUBLIC_TOKEN_ADDRESS` to a deployed ERC20 to enable balance reads and transfer submission.

## Environment variables

Only `NEXT_PUBLIC_*` values are exposed to the browser. Do not place private keys or RPC credentials in `.env.local` for frontend-only work.

| Variable | Required | Scope | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_TOKEN_ADDRESS` | yes | browser | ERC20 used by the fixture. Zero address keeps transfers disabled. |
| `NEXT_PUBLIC_CHAIN_ID` | yes | browser | Expected wallet chain. Defaults to Sepolia (`11155111`). |
| `NEXT_PUBLIC_APP_NAME` | no | browser | Display/integration label. |
| `NEXT_PUBLIC_DEPLOYER_ADDRESS` | no | browser/tests | Optional expected wallet QA account. |
| `PLAYWRIGHT_BASE_URL` | no | tests | Use an existing server instead of Playwright-managed `next dev`. |
| `SEPOLIA_RPC_URL` | deploy only | shell | RPC endpoint for Foundry scripts. Never commit real values. |
| `PRIVATE_KEY` | deploy only | shell | Deployer key for `forge script`. Use a testnet-only key. |
| `ETHERSCAN_API_KEY` | verify only | shell | Optional contract verification key. |

## Stable QA selectors

The UI keeps these selectors stable for wallet/browser automation:

- `connect-wallet-button`
- `connected-account`
- `current-chain`
- `token-address`
- `token-balance`
- `transfer-recipient-input`
- `transfer-amount-input`
- `transfer-token-button`
- `transfer-status`

## Verification

Run the same checks expected in review:

```bash
npm run lint
npm run build
npm run test:wallet
forge fmt --check
forge build
forge test
```

Convenience scripts are also available:

```bash
npm run forge:build
npm run forge:test
npm run forge:check
```

`npm run test:wallet` starts a local Next.js server through Playwright unless `PLAYWRIGHT_BASE_URL` points at an already running app.

## Contract workflow

Install Foundry if needed:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Initialize submodules if `forge-std` is missing:

```bash
git submodule update --init --recursive
```

Build and test:

```bash
forge build
forge test
```

Deploy to Sepolia only from a local shell with non-production credentials:

```bash
cp .env.example .env
# edit .env locally; do not commit real values
set -a
source .env
set +a
forge script script/Deploy.s.sol:Deploy --rpc-url "$SEPOLIA_RPC_URL" --broadcast -vvvv
```

Add `--verify` when `ETHERSCAN_API_KEY` is set.

## Documentation

- [Wallet QA runbook](docs/wallet-qa.md)
- [Deployment notes](docs/deployment.md)

## Safety

- Testnets only; do not use production keys.
- `.env`, `.env.*`, Foundry `broadcast/`, `cache/`, `.next/`, Playwright reports, wallet artifacts, and `node_modules/` are ignored.
- Review generated screenshots and manifests before sharing. They should not include seeds, private keys, RPC URLs, local paths, or unmasked secrets.
