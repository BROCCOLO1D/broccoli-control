# Wallet QA runbook

Broccoli Control is the downstream dapp used to prove `@broccolo1d/*` wallet automation against a realistic injected-wallet surface. The default path is deterministic and safe for CI. The real MetaMask path is gated because it uses headed Chromium, an unpacked extension, a persistent browser profile, and testnet-only wallet material.

## Default deterministic run

```bash
npm run test:wallet
```

The default suite:

- renders the Broccoli Control fixture and stable selectors;
- writes a safe `wallet-qa-proof.json` through `walletArtifacts.writeProofManifest`;
- verifies the proof with `verifyWalletQaProofManifest`;
- records negative/fail-closed assertion examples with `createFailClosedWalletPromptDriver`, `formatWalletQaFailure`, and `walletArtifacts.writeFailureManifest`.

Artifacts are written below `.wallet-artifacts/broccoli-control/` and are ignored by git. Promote only reviewed, redacted derivatives into `docs/assets/wallet-qa/`.

## Helper API usage

The tests and promotion script intentionally use the `@broccolo1d/*@0.2.1` public helper APIs:

```ts
import {
  createFailClosedWalletPromptDriver,
  formatWalletQaFailure,
  verifyWalletQaProofManifest,
} from '@broccolo1d/playwright';
import {
  chainIdToHex,
  maskEthereumAddress,
} from '@broccolo1d/wallet-browser';
```

Proof-writing path:

```ts
const screenshot = await walletArtifacts.screenshot('broccoli-control-home');
await walletArtifacts.writeProofManifest({
  status: 'connected',
  origin: 'http://127.0.0.1:3000',
  chainId: 11155111,
  attachments: [{ label: 'ui-ready', path: screenshot, contentType: 'image/png' }],
  notes: ['UI-ready proof only; no wallet account is connected in this smoke test.'],
});
await verifyWalletQaProofManifest(walletArtifacts.artifactDir);
```

Fail-closed prompt path:

```ts
const expectedAccount = `0x${'11'.repeat(20)}`;
const prompt = createFailClosedWalletPromptDriver({
  origin: 'http://127.0.0.1:3000',
  expectedAccount,
  expectedChainIdHex: chainIdToHex(11155111),
});

await expect(prompt.approveConnection({
  origin: 'https://evil.invalid',
  expectedAccount,
  expectedChainIdHex: chainIdToHex(11155111),
})).rejects.toThrow(/fail closed/i);
```

Reusable wallet/browser behavior belongs in `@broccolo1d/playwright` and `@broccolo1d/wallet-browser`; repo-local code is limited to Broccoli Control selectors, proof orchestration, redaction, and promotion policy.

## Committed proof artifacts

| Artifact | Source | Review status |
| --- | --- | --- |
| [`assets/wallet-qa/real-metamask-proof.json`](assets/wallet-qa/real-metamask-proof.json) | Gated real MetaMask run | Masked account, attachment basename/hash only |
| [`assets/wallet-qa/real-metamask-connected-redacted.png`](assets/wallet-qa/real-metamask-connected-redacted.png) | Gated real MetaMask run | Connected-account DOM text redacted before capture |
| [`assets/wallet-qa/fail-closed-assertion-example.json`](assets/wallet-qa/fail-closed-assertion-example.json) | Deterministic negative test | Masked expected/actual accounts and redacted path |
| [`assets/wallet-qa/fail-closed-ui.png`](assets/wallet-qa/fail-closed-ui.png) | Deterministic negative test | No secrets or full private addresses |

![Real MetaMask connected proof with account redacted](assets/wallet-qa/real-metamask-connected-redacted.png)

## Fail-closed failure example

The committed failure manifest demonstrates what a rejected wallet prompt assertion looks like when origin, account, or chain do not match the expected policy.

```json
{
  "example": "doc-safe failed account assertion",
  "maskedExpectedAccount": "0x1111…1111",
  "maskedActualAccount": "0x2222…2222",
  "failure": "Error: Connected account 0x2222…2222 did not match expected 0x1111…1111 at [path]/broccoli-control.spec.ts"
}
```

Representative failure string:

```text
Wallet prompt account 0x2222…2222 does not match expected 0x1111…1111; fail closed.
```

This is intentional: prompt automation must reject before approval when it cannot prove the dapp origin, account, and chain.

![Fail-closed wallet assertion UI](assets/wallet-qa/fail-closed-ui.png)

## Real MetaMask proof (gated)

Run this only from a local shell with testnet-only wallet material. Do not print or commit private keys, passwords, recovery phrases, RPC URLs, raw profile data, unredacted screenshots, or full private wallet addresses.

Required local values are loaded from the path in `WALLET_QA_ENV_FILE`. That file must remain ignored and machine-local; do not commit or paste it.

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_WALLET_ADDRESS` | Expected testnet account; public manifests store only a masked address. |
| `SEPOLIA_WALLET_PRIVATE_KEY` | Imported into the local MetaMask profile if the profile is not already ready. |
| `METAMASK_PASSWORD` | Unlocks or initializes the local MetaMask profile. |
| `WALLET_PROFILE_DIR` | Persistent Chromium/MetaMask profile directory. |
| `METAMASK_EXTENSION_DIR` | Unpacked MetaMask extension directory; resolved relative to the env file when relative. |
| `NEXT_PUBLIC_CHAIN_ID` | Expected chain; defaults to Sepolia `11155111`. |
| `PLAYWRIGHT_BASE_URL` | Optional already-running Broccoli Control URL. |

Run the gated test directly:

```bash
WALLET_QA_REAL_METAMASK=1 npm run test:wallet -- --grep "real MetaMask proof"
```

Generate and promote reviewed public derivatives:

```bash
npm run wallet:proof:metamask
```

The promotion script runs headed Chromium under `xvfb-run`, loads the real MetaMask extension, unlocks/onboards the local profile when needed, imports the testnet key when needed, connects the dapp, and writes a proof with `writeWalletQaProofManifest`. Raw outputs stay under `.wallet-artifacts/`. Promoted public artifacts contain only:

- masked account (`0x1234…abcd` style);
- origin and chain id;
- attachment basenames, sizes, and SHA-256 hashes;
- screenshots whose connected-account text is redacted before capture.

If the real proof fails, inspect `.wallet-artifacts/**/ERROR.public.txt` and `wallet-qa-proof.json`. Common blockers are stale MetaMask onboarding UI, an incorrect extension directory, a locked profile with the wrong password, the wallet on the wrong chain, or a dapp server that is not reachable at `PLAYWRIGHT_BASE_URL`.

## Review checklist before committing artifacts

1. Run `npm run test:wallet` and verify default tests pass.
2. For real MetaMask evidence, run through `xvfb-run` and promote only redacted derivatives.
3. Open each promoted PNG and JSON file manually.
4. Confirm no full wallet address, private key, recovery phrase, password, RPC URL, or full local path appears.
5. Re-run `verifyWalletQaProofManifest` through the tests or promotion script.
