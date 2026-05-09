'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, createConfig, WagmiProvider } from 'wagmi';
import { sepolia, foundry } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [sepolia, foundry],
  connectors: [
    injected({
      shimDisconnect: true,
      target: 'metaMask',
    }),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [sepolia.id]: http(),
    [foundry.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
