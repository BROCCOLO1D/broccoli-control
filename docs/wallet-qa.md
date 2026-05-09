# Wallet QA runbook

Broccoli Control is a downstream fixture dapp for `@broccolo1d/playwright`. The goal is reproducible wallet automation against a stable product-like surface.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run test:wallet
```

Playwright starts `npm run dev -- --hostname 127.0.0.1 --port 3000` automatically when `PLAYWRIGHT_BASE_URL` is not set.

To point at an existing server:

```bash
npm run dev
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:wallet
```

## What the smoke test covers

`tests/wallet/broccoli-control.spec.ts` verifies that:

- the Broccoli Control heading renders;
- wallet connect control is visible;
- configured chain ID is rendered;
- token address renders as an address;
- transfer is disabled before a wallet/token-ready state;
- screenshot and manifest artifacts can be written.

## Artifact policy

Wallet QA artifacts are local by default:

- `.wallet-artifacts/`
- `test-results/`
- `playwright-report/`
- `traces/`

Do not commit generated artifacts unless intentionally promoting a public-safe screenshot for documentation. Before sharing artifacts, verify that no private key, seed phrase, RPC URL, or machine-specific path is visible.

## Selector contract

Keep these `data-testid` selectors stable unless a coordinated breaking test update is planned:

- `connect-wallet-button`
- `connected-account`
- `current-chain`
- `token-address`
- `token-balance`
- `transfer-recipient-input`
- `transfer-amount-input`
- `transfer-token-button`
- `transfer-status`
