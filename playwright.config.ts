import { defineWalletQaConfig } from '@broccolo1d/playwright';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineWalletQaConfig({
  testDir: './tests/wallet',
  timeout: 30_000,
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  use: {
    baseURL,
    walletConfig: {
      useRealWallet: false,
      artifactDir: '.wallet-artifacts/broccoli-control',
      origin: baseURL,
      expectedChainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111),
      expectedAccount: process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? '0x0000000000000000000000000000000000000000',
    },
  },
});
