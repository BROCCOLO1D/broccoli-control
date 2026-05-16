'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatUnits, isAddress, parseUnits, type Address } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { erc20Abi } from '@/lib/erc20Abi';

const zeroAddress = `0x${'00'.repeat(20)}` as Address;
const configuredTokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || zeroAddress) as Address;
const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

type MinimalInjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function injectedEthereum() {
  return (window as Window & { ethereum?: MinimalInjectedEthereum }).ethereum;
}

function shortAddress(value?: string) {
  if (!value) return 'Not connected';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isNonZeroAddress(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value) && value.toLowerCase() !== zeroAddress;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [fallbackAccount, setFallbackAccount] = useState<Address>();
  const [fallbackChainId, setFallbackChainId] = useState(configuredChainId);
  const [isInjectedPending, setIsInjectedPending] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');

  const tokenConfigured = isNonZeroAddress(configuredTokenAddress);
  const injectedConnector = connectors[0];
  const connectedAddress = address ?? fallbackAccount;
  const connectedChainId = address ? chainId : fallbackChainId;
  const walletLinked = isConnected || Boolean(fallbackAccount);
  const networkAligned = connectedChainId === configuredChainId;

  const { data: nativeBalance } = useBalance({ address });
  const { data: decimals = 18 } = useReadContract({
    abi: erc20Abi,
    address: configuredTokenAddress,
    functionName: 'decimals',
    query: { enabled: tokenConfigured },
  });
  const { data: symbol = 'BROC' } = useReadContract({
    abi: erc20Abi,
    address: configuredTokenAddress,
    functionName: 'symbol',
    query: { enabled: tokenConfigured },
  });
  const { data: rawTokenBalance, refetch: refetchBalance } = useReadContract({
    abi: erc20Abi,
    address: configuredTokenAddress,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: Boolean(tokenConfigured && connectedAddress) },
  });

  const { data: txHash, error: writeError, isPending: isWritePending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const tokenBalance = useMemo(() => {
    if (!tokenConfigured) return 'Set NEXT_PUBLIC_TOKEN_ADDRESS';
    if (!connectedAddress) return 'Connect wallet';
    if (rawTokenBalance === undefined) return 'Loading...';
    return `${formatUnits(rawTokenBalance, Number(decimals))} ${symbol}`;
  }, [connectedAddress, decimals, rawTokenBalance, symbol, tokenConfigured]);

  async function connectInjectedWallet() {
    setIsInjectedPending(true);
    setFormError('');
    try {
      const accounts = await injectedEthereum()?.request({ method: 'eth_requestAccounts' });
      const [account] = Array.isArray(accounts) ? accounts : [];
      setFallbackAccount(isNonZeroAddress(account) ? account : undefined);
      const chainHex = await injectedEthereum()?.request({ method: 'eth_chainId' });
      if (typeof chainHex === 'string') setFallbackChainId(Number.parseInt(chainHex, 16));
      if (injectedConnector) connect({ connector: injectedConnector });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Injected wallet connection failed.');
    } finally {
      setIsInjectedPending(false);
    }
  }

  useEffect(() => {
    const ethereum = injectedEthereum();
    if (!ethereum?.on) return undefined;
    const onAccountsChanged = (accounts: unknown) => {
      const [account] = Array.isArray(accounts) ? accounts : [];
      setFallbackAccount(isNonZeroAddress(account) ? account : undefined);
    };
    const onChainChanged = (chain: unknown) => {
      if (typeof chain === 'string') setFallbackChainId(Number.parseInt(chain, 16));
    };
    ethereum.on('accountsChanged', onAccountsChanged);
    ethereum.on('chainChanged', onChainChanged);
    const refreshInjectedState = async () => {
      const accounts = await ethereum.request({ method: 'eth_accounts' }).catch(() => undefined);
      const [account] = Array.isArray(accounts) ? accounts : [];
      setFallbackAccount(isNonZeroAddress(account) ? account : undefined);
      const chain = await ethereum.request({ method: 'eth_chainId' }).catch(() => undefined);
      if (typeof chain === 'string') setFallbackChainId(Number.parseInt(chain, 16));
    };
    const interval = window.setInterval(() => { void refreshInjectedState(); }, 1_000);
    void refreshInjectedState();
    return () => {
      window.clearInterval(interval);
      ethereum.removeListener?.('accountsChanged', onAccountsChanged);
      ethereum.removeListener?.('chainChanged', onChainChanged);
    };
  }, []);

  async function onTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (!tokenConfigured) return setFormError('Configure NEXT_PUBLIC_TOKEN_ADDRESS before transferring.');
    if (!isAddress(recipient)) return setFormError('Enter a valid recipient address.');

    let value: bigint;
    try {
      value = parseUnits(amount || '0', Number(decimals));
    } catch {
      return setFormError('Enter a valid token amount.');
    }

    if (value <= 0n) return setFormError('Amount must be greater than zero.');

    writeContract(
      {
        abi: erc20Abi,
        address: configuredTokenAddress,
        functionName: 'transfer',
        args: [recipient as Address, value],
      },
      {
        onSuccess: () => {
          setAmount('');
          void refetchBalance();
        },
      },
    );
  }

  const transferStatus = formError
    || writeError?.message
    || (isWritePending ? 'Waiting for wallet confirmation...'
      : isConfirming ? `Transaction submitted: ${txHash}`
        : isConfirmed ? `Transfer confirmed: ${txHash}`
          : txHash ? `Transaction submitted: ${txHash}`
            : 'Ready. No transaction in flight.');

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Application status">
        <div className="brand-mark" aria-hidden="true">BC</div>
        <div>
          <p className="overline">Broccoli Control</p>
          <p className="topbar-copy">Wallet QA ERC20 fixture / Sepolia-first</p>
        </div>
        <div className="topbar-status">
          <span className={`status-dot ${walletLinked ? 'is-live' : ''}`} aria-hidden="true" />
          {walletLinked ? 'wallet linked' : 'wallet offline'}
        </div>
      </header>

      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Technical fixture / controlled surface</p>
          <h1>Broccoli Control</h1>
          <p className="lede">
            A restrained ERC20 testbed for wallet connection, chain inspection, balance reads,
            and deterministic token transfer QA. Black-and-white rails; broccoli-green signal.
          </p>
        </div>
        <div className="hero-console" aria-label="Fixture summary">
          <span>fixture: erc20-transfer</span>
          <span>target-chain: {configuredChainId}</span>
          <span>token: {tokenConfigured ? shortAddress(configuredTokenAddress) : 'unconfigured'}</span>
        </div>
        <div className="actions">
          {!walletLinked ? (
            <button
              data-testid="connect-wallet-button"
              className="button primary"
              disabled={isConnectPending || isInjectedPending}
              onClick={() => { void connectInjectedWallet(); }}
            >
              {isConnectPending || isInjectedPending ? 'Opening connector' : 'Connect wallet'}
            </button>
          ) : (
            <button data-testid="connect-wallet-button" className="button" onClick={() => { setFallbackAccount(undefined); disconnect(); }}>
              Disconnect wallet
            </button>
          )}
        </div>
      </section>

      <section className="status-grid" aria-label="Runtime state">
        <article className="metric panel">
          <span className="label">Connected account</span>
          <strong data-testid="connected-account" className="mono wrap">
            {connectedAddress ?? 'Not connected'}
          </strong>
          <small>{nativeBalance ? `${formatUnits(nativeBalance.value, nativeBalance.decimals)} ${nativeBalance.symbol}` : 'Native balance unavailable until connected'}</small>
        </article>

        <article className="metric panel">
          <span className="label">Current chain</span>
          <strong data-testid="current-chain" className="mono">{connectedChainId}</strong>
          <small>{networkAligned ? 'Aligned with NEXT_PUBLIC_CHAIN_ID' : `Expected ${configuredChainId}`}</small>
        </article>

        <article className="metric panel span-2">
          <span className="label">Token address</span>
          <strong data-testid="token-address" className="mono wrap">{configuredTokenAddress}</strong>
          <small>{tokenConfigured ? 'ERC20 reads enabled' : 'Set NEXT_PUBLIC_TOKEN_ADDRESS in .env.local'}</small>
        </article>

        <article className="metric panel span-2 accent-panel">
          <span className="label">Token balance</span>
          <strong data-testid="token-balance">{tokenBalance}</strong>
        </article>
      </section>

      <form className="transfer panel" onSubmit={onTransfer}>
        <div className="section-heading">
          <p className="eyebrow">Transfer harness</p>
          <h2>Submit ERC20 transfer</h2>
          <p>Keep this flow boring and stable: one recipient, one amount, one transaction status.</p>
        </div>

        <div className="form-grid">
          <label>
            Recipient
            <input
              data-testid="transfer-recipient-input"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Amount
            <input
              data-testid="transfer-amount-input"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1.0"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>
        </div>

        <button
          data-testid="transfer-token-button"
          className="button primary"
          type="submit"
          disabled={!isConnected || !tokenConfigured || isWritePending || isConfirming}
        >
          {isWritePending || isConfirming ? 'Awaiting settlement' : 'Transfer BROC'}
        </button>
        <p data-testid="transfer-status" className="status mono">{transferStatus}</p>
      </form>
    </main>
  );
}
