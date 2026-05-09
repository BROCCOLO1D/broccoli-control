'use client';

import { FormEvent, useMemo, useState } from 'react';
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

const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;
const configuredTokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || zeroAddress) as Address;
const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

function shortAddress(value?: string) {
  if (!value) return 'Not connected';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');

  const tokenConfigured = isAddress(configuredTokenAddress) && configuredTokenAddress !== zeroAddress;
  const injectedConnector = connectors[0];
  const networkAligned = chainId === configuredChainId;

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
    args: address ? [address] : undefined,
    query: { enabled: Boolean(tokenConfigured && address) },
  });

  const { data: txHash, error: writeError, isPending: isWritePending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const tokenBalance = useMemo(() => {
    if (!tokenConfigured) return 'Set NEXT_PUBLIC_TOKEN_ADDRESS';
    if (!address) return 'Connect wallet';
    if (rawTokenBalance === undefined) return 'Loading...';
    return `${formatUnits(rawTokenBalance, Number(decimals))} ${symbol}`;
  }, [address, decimals, rawTokenBalance, symbol, tokenConfigured]);

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
          <span className={`status-dot ${isConnected ? 'is-live' : ''}`} aria-hidden="true" />
          {isConnected ? 'wallet linked' : 'wallet offline'}
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
          {!isConnected ? (
            <button
              data-testid="connect-wallet-button"
              className="button primary"
              disabled={!injectedConnector || isConnectPending}
              onClick={() => injectedConnector && connect({ connector: injectedConnector })}
            >
              {isConnectPending ? 'Opening connector' : 'Connect wallet'}
            </button>
          ) : (
            <button data-testid="connect-wallet-button" className="button" onClick={() => disconnect()}>
              Disconnect wallet
            </button>
          )}
        </div>
      </section>

      <section className="status-grid" aria-label="Runtime state">
        <article className="metric panel">
          <span className="label">Connected account</span>
          <strong data-testid="connected-account" className="mono wrap">
            {address ?? 'Not connected'}
          </strong>
          <small>{nativeBalance ? `${formatUnits(nativeBalance.value, nativeBalance.decimals)} ${nativeBalance.symbol}` : 'Native balance unavailable until connected'}</small>
        </article>

        <article className="metric panel">
          <span className="label">Current chain</span>
          <strong data-testid="current-chain" className="mono">{chainId}</strong>
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
