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
            : 'Ready for a tidy token transfer.');

  return (
    <main className="shell">
      <section className="hero card">
        <div className="sprout" aria-hidden="true">🥦</div>
        <p className="eyebrow">official wallet QA fixture</p>
        <h1>Broccoli Control</h1>
        <p className="lede">
          A cheerful green ERC20 playground for connecting wallets, checking balances,
          and sending tiny testnet broccoli bits.
        </p>
        <div className="actions">
          {!isConnected ? (
            <button
              data-testid="connect-wallet-button"
              className="button primary"
              disabled={!injectedConnector || isConnectPending}
              onClick={() => injectedConnector && connect({ connector: injectedConnector })}
            >
              {isConnectPending ? 'Opening garden gate...' : 'Connect wallet'}
            </button>
          ) : (
            <button data-testid="connect-wallet-button" className="button" onClick={() => disconnect()}>
              Disconnect wallet
            </button>
          )}
        </div>
      </section>

      <section className="grid">
        <article className="card info-card">
          <span className="label">Connected account</span>
          <strong data-testid="connected-account" className="mono wrap">
            {address ?? 'Not connected'}
          </strong>
          {nativeBalance && <small>{formatUnits(nativeBalance.value, nativeBalance.decimals)} {nativeBalance.symbol}</small>}
        </article>

        <article className="card info-card">
          <span className="label">Current chain</span>
          <strong data-testid="current-chain">{chainId}</strong>
          <small>Default fixture target: Sepolia (11155111)</small>
        </article>

        <article className="card info-card wide">
          <span className="label">Token address</span>
          <strong data-testid="token-address" className="mono wrap">{configuredTokenAddress}</strong>
          <small>{tokenConfigured ? 'Ready to read ERC20 state' : 'Set NEXT_PUBLIC_TOKEN_ADDRESS in .env.local'}</small>
        </article>

        <article className="card info-card wide">
          <span className="label">Token balance</span>
          <strong data-testid="token-balance">{tokenBalance}</strong>
        </article>
      </section>

      <form className="card transfer" onSubmit={onTransfer}>
        <div>
          <p className="eyebrow">send sprouts</p>
          <h2>Transfer token</h2>
          <p>Use Sepolia test funds only. This fixture is intentionally simple for automation.</p>
        </div>
        <label>
          Recipient
          <input
            data-testid="transfer-recipient-input"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
          />
        </label>
        <label>
          Amount
          <input
            data-testid="transfer-amount-input"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="1.5"
            inputMode="decimal"
            autoComplete="off"
          />
        </label>
        <button
          data-testid="transfer-token-button"
          className="button primary"
          type="submit"
          disabled={!isConnected || !tokenConfigured || isWritePending || isConfirming}
        >
          {isWritePending || isConfirming ? 'Tending transaction...' : 'Transfer broccoli'}
        </button>
        <p data-testid="transfer-status" className="status">{transferStatus}</p>
      </form>
    </main>
  );
}
