import {
  createFailClosedWalletPromptDriver,
  expect,
  formatWalletQaFailure,
  test,
  verifyWalletQaProofManifest,
} from '@broccolo1d/playwright';
import {
  chainIdToHex,
  maskEthereumAddress,
  type WalletConnectionPromptInput,
  type WalletSignaturePromptInput,
  type WalletTransactionPromptInput,
} from '@broccolo1d/wallet-browser';

const appOrigin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);
const expectedAccount = process.env.SEPOLIA_WALLET_ADDRESS ?? process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
const testAccount = `0x${'11'.repeat(20)}`;
const wrongAccount = `0x${'22'.repeat(20)}`;
const zeroAddress = `0x${'00'.repeat(20)}`;

function isNonZeroAddress(value: string | undefined): value is string {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? '') && value?.toLowerCase() !== zeroAddress;
}

const realMetaMaskReady = process.env.WALLET_QA_REAL_METAMASK === '1' && isNonZeroAddress(expectedAccount);

test('renders the Broccoli Control wallet QA fixture surface', async ({ page, walletArtifacts }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Broccoli Control' })).toBeVisible();
  await expect(page.getByTestId('connect-wallet-button')).toBeVisible();
  await expect(page.getByTestId('current-chain')).toContainText(String(expectedChainId));
  await expect(page.getByTestId('token-address')).toContainText(/^0x[a-fA-F0-9]{40}$/);
  await expect(page.getByTestId('transfer-token-button')).toBeDisabled();

  const screenshot = await walletArtifacts.screenshot('broccoli-control-home');
  const manifest = await walletArtifacts.writeProofManifest({
    status: 'failed',
    origin: appOrigin,
    chainId: expectedChainId,
    failure: new Error('UI readiness proof only; no wallet connection was attempted.'),
    attachments: [{ label: 'ui-ready', path: screenshot, contentType: 'image/png' }],
    notes: ['UI-ready proof only; no wallet account is connected in this smoke test.'],
  });

  await verifyWalletQaProofManifest(walletArtifacts.artifactDir);
  expect(manifest).toContain('wallet-qa-proof.json');
});

test('records safe fail-closed wallet assertion examples', async ({ page, walletArtifacts }) => {
  await page.goto('/');

  const screenshot = await walletArtifacts.screenshot('broccoli-control-fail-closed');
  const prompt = createFailClosedWalletPromptDriver({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainIdHex: chainIdToHex(expectedChainId),
  });

  const failures: string[] = [];
  const cases: Array<[string, WalletConnectionPromptInput]> = [
    ['origin', { origin: 'https://evil.invalid', expectedAccount: testAccount, expectedChainIdHex: chainIdToHex(expectedChainId) }],
    ['account', { origin: appOrigin, expectedAccount: wrongAccount, expectedChainIdHex: chainIdToHex(expectedChainId) }],
    ['chain', { origin: appOrigin, expectedAccount: testAccount, expectedChainIdHex: '0x1' }],
  ];

  for (const [label, input] of cases) {
    await expect(prompt.approveConnection(input)).rejects.toThrow(/fail closed/i);
    try {
      await prompt.approveConnection(input);
    } catch (error) {
      failures.push(`${label}: ${formatWalletQaFailure(error)}`);
    }
  }

  const failureManifest = await walletArtifacts.writeFailureManifest(
    'fail-closed-assertion-example',
    new Error(`Connected account ${wrongAccount} did not match expected ${testAccount} at /home/example/broccoli-control/tests/wallet/broccoli-control.spec.ts`),
    {
      example: 'doc-safe failed account assertion',
      maskedExpectedAccount: maskEthereumAddress(testAccount),
      maskedActualAccount: maskEthereumAddress(wrongAccount),
    },
  );

  const proofManifest = await walletArtifacts.writeProofManifest({
    status: 'failed',
    origin: appOrigin,
    account: wrongAccount,
    chainId: 1,
    failure: new Error(failures.join('\n')),
    attachments: [{ label: 'fail-closed-ui', path: screenshot, contentType: 'image/png' }],
    notes: ['Negative proof: wrong origin, account, and chain assertions are rejected before approval.'],
  });

  await verifyWalletQaProofManifest(walletArtifacts.artifactDir);
  expect(failureManifest).toContain('fail-closed-assertion-example.json');
  expect(proofManifest).toContain('wallet-qa-proof.json');
});

test('documents canonical helper guardrails from the published package', async ({ wallet }) => {
  const expectedChainIdHex = chainIdToHex(expectedChainId);
  const typedData = JSON.stringify({
    domain: { name: 'Broccoli Control', chainId: expectedChainId },
    primaryType: 'Login',
    message: { prompt: 'Sign in to Broccoli Control' },
    types: { Login: [{ name: 'prompt', type: 'string' }] },
  });
  const approvals: string[] = [];
  const prompt = createFailClosedWalletPromptDriver({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainIdHex,
    delegate: {
      async approveSignature(input: WalletSignaturePromptInput) {
        approvals.push(`${input.signatureKind}:${input.expectedChainIdHex}`);
      },
      async approveTransaction(input: WalletTransactionPromptInput) {
        approvals.push(`tx:${input.to ?? 'none'}:${input.value ?? '0'}`);
      },
    },
  });

  await prompt.approveSignature({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainIdHex,
    signatureKind: 'personal_sign',
    message: 'Sign in to Broccoli Control',
  });
  await prompt.approveSignature({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainIdHex,
    signatureKind: 'typed_data',
    message: typedData,
  });
  await prompt.approveTransaction({
    origin: appOrigin,
    expectedAccount: testAccount,
    to: testAccount,
    value: '0',
  });

  await expect(prompt.approveSignature({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainIdHex: '0x1',
    signatureKind: 'personal_sign',
    message: 'wrong chain',
  })).rejects.toThrow(/chain.*fail closed/i);
  await expect(wallet.switchChain({ expectedAccount: testAccount, expectedChainId })).rejects.toThrow(/network.*fail closed/i);
  await expect(wallet.signMessage({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainId,
    message: 'Sign in to Broccoli Control',
  })).rejects.toThrow(/prompt.*fail closed/i);
  await expect(wallet.signTypedData({
    origin: appOrigin,
    expectedAccount: testAccount,
    expectedChainId,
    message: typedData,
  })).rejects.toThrow(/prompt.*fail closed/i);

  expect(approvals).toEqual([
    `personal_sign:${expectedChainIdHex}`,
    `typed_data:${expectedChainIdHex}`,
    `tx:${testAccount}:0`,
  ]);
});

test.describe('real MetaMask proof', () => {
  test.skip(!realMetaMaskReady, 'Set WALLET_QA_REAL_METAMASK=1 and a Sepolia wallet address to run the real MetaMask proof.');

  test('connects through a real MetaMask Chromium profile and writes public proof', async ({ walletArtifacts }) => {
    test.setTimeout(180_000);
    if (!isNonZeroAddress(expectedAccount)) throw new Error('A non-zero Sepolia wallet address is required for real MetaMask proof.');

    const { runRealMetaMaskProof } = await import('../../scripts/real-metamask-proof.mjs');
    await runRealMetaMaskProof({
      appOrigin,
      expectedAccount,
      expectedChainId,
      artifactDir: walletArtifacts.artifactDir,
    });
    await verifyWalletQaProofManifest(walletArtifacts.artifactDir);
  });
});
