# Deployment notes

Broccoli Control Token is a small ERC20 fixture intended for Sepolia and local wallet QA only. Deploy from a local shell with testnet-only credentials; never use production keys.

## Inputs

Use local shell environment variables. Never commit real values.

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_RPC_URL` | RPC endpoint used by `forge script`. |
| `PRIVATE_KEY` | Testnet deployer key. This account becomes token owner and receives initial supply. |
| `ETHERSCAN_API_KEY` | Optional verification key used by `--verify`. |

## Build and test before deployment

```bash
npm run forge:check
```

Expanded form:

```bash
forge fmt --check
forge build
forge test
```

## Deploy

```bash
cp .env.example .env
# edit placeholders locally; do not commit real values
set -a
source .env
set +a
npm run forge:deploy:sepolia
```

The npm script runs:

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast --verify -vvvv
```

Set `ETHERSCAN_API_KEY` when verification is required. If verification is not configured, run the same `forge script` command without `--verify`.

## Wire frontend

After deployment, set browser-safe values in `.env.local` or the hosting provider:

```bash
NEXT_PUBLIC_TOKEN_ADDRESS=<deployed testnet token address>
NEXT_PUBLIC_CHAIN_ID=11155111
```

Restart/rebuild the frontend after changing public environment variables.

## Operational notes

- The deployer is the token owner.
- `INITIAL_SUPPLY` is minted to the deployer.
- `mint(address,uint256)` is owner-only and exists for fixture reset/top-up workflows.
- Treat broadcast artifacts as public transaction metadata; review before sharing.
- Public docs and screenshots must not include private keys, RPC URLs, full private wallet addresses, or full local paths.
