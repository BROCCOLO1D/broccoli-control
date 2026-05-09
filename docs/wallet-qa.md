# Wallet QA runbook

Broccoli Control is the downstream dapp used to prove wallet automation against a realistic injected-wallet surface. The default path is deterministic and safe for CI; the real MetaMask path is gated because it uses a headed Chromium profile, a local extension checkout, and testnet-only wallet material.

## Default deterministic run

```bash
npm run test:wallet
```

The default test suite:

- renders the Broccoli Control fixture and stable selectors;
- writes a safe `wallet-qa-proof.json` via `walletArtifacts.writeProofManifest`;
- verifies the proof with `verifyWalletQaProofManifest`;
- records a negative/fail-closed assertion example using `createFailClosedWalletPromptDriver`, `formatWalletQaFailure`, and `walletArtifacts.writeFailureManifest`.

Artifacts are written below `.wallet-artifacts/broccoli-control/` and are ignored by git unless a reviewed, redacted derivative is explicitly promoted into `docs/assets/wallet-qa/`.

## Fail-closed failure example

Committed example artifacts:

- [`docs/assets/wallet-qa/fail-closed-assertion-example.json`](assets/wallet-qa/fail-closed-assertion-example.json)
- [`docs/assets/wallet-qa/fail-closed-ui.png`](assets/wallet-qa/fail-closed-ui.png)

The manifest demonstrates what a rejected wallet prompt assertion looks like when origin, account, or chain do not match the expected policy. The helper masks addresses and strips local paths before writing public artifacts. A representative failure string is:

```text
Wallet prompt account 0x2222…2222 does not match expected 0x1111…1111; fail closed.
```

This is intentional: prompt automation must reject before approval when it cannot prove the dapp origin, account, and chain.

## Real MetaMask proof (gated)

Run this only from a local shell with testnet-only wallet material. Do not print or commit private keys, passwords, recovery phrases, RPC URLs, raw profile data, or unredacted screenshots.

Required local values are loaded from the path in `WALLET_QA_ENV_FILE`. In this workstation, that file is an ignored local `.env` from the package repo; do not commit or paste it.

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_WALLET_ADDRESS` | expected testnet account; manifests store only a masked address |
| `SEPOLIA_WALLET_PRIVATE_KEY` | imported into local MetaMask if the profile is not already ready |
| `METAMASK_PASSWORD` | unlocks or initializes the local MetaMask profile |
| `WALLET_PROFILE_DIR` | persistent Chromium/MetaMask profile directory |
| `METAMASK_EXTENSION_DIR` | unpacked MetaMask extension directory; resolved relative to the env file when relative |
| `NEXT_PUBLIC_CHAIN_ID` | expected chain; defaults to Sepolia `11155111` |
| `PLAYWRIGHT_BASE_URL` | optional already-running Broccoli Control URL |

Command:

```bash
WALLET_QA_REAL_METAMASK=1 npm run test:wallet -- --grep "real MetaMask proof"
```

or, to generate and promote reviewed public derivatives:

```bash
npm run wallet:proof:metamask
```

The script uses headed Chromium under `xvfb-run`, loads the real MetaMask extension, unlocks/onboards the local profile when needed, imports the testnet key when needed, connects the dapp, and writes a proof with `writeWalletQaProofManifest`. Raw outputs stay under `.wallet-artifacts/`. The promoted public proof contains only:

- masked account (`0x1234…abcd` style);
- origin and chain id;
- attachment basenames, sizes, and SHA-256 hashes;
- a screenshot whose connected-account DOM text is redacted before capture.

If the real proof fails, inspect `.wallet-artifacts/**/ERROR.public.txt` and `wallet-qa-proof.json`. Common blockers are stale MetaMask onboarding UI, an incorrect extension directory, a locked profile with the wrong password, the wallet on the wrong chain, or a dapp server that is not reachable at `PLAYWRIGHT_BASE_URL`.

## Review checklist before committing artifacts

1. Run `npm run test:wallet` and verify default tests pass.
2. For real MetaMask evidence, run through `xvfb-run` and promote only redacted derivatives.
3. Open each promoted PNG and JSON file manually.
4. Confirm no full wallet address, private key, recovery phrase, password, RPC URL, or full local path appears.
5. Re-run `verifyWalletQaProofManifest` through the tests or script.

## Helper API usage

The tests and script intentionally use the `@broccolo1d/*@0.2.1` public helper APIs:

- `walletArtifacts.writeProofManifest(...)`
- `verifyWalletQaProofManifest(...)`
- `walletArtifacts.writeFailureManifest(...)`
- `formatWalletQaFailure(...)`
- `createFailClosedWalletPromptDriver(...)`
- `writeWalletQaProofManifest(...)` in the standalone real MetaMask script

Reusable wallet/browser behavior belongs in `@broccolo1d/playwright` and `@broccolo1d/wallet-browser`; repo-local code is limited to Broccoli Control selectors, proof orchestration, and redaction/promotion policy.
