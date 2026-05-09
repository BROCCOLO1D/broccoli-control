import { defineWalletQaConfig } from '@broccolo1d/playwright';

export default defineWalletQaConfig({
  testDir: './tests/wallet',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    walletConfig: {
      useRealWallet: false,
      artifactDir: '.wallet-artifacts/broccoli-control',
      origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
      expectedChainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111),
      expectedAccount: process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS ?? '0x0000000000000000000000000000000000000000',
    },
  },
});
