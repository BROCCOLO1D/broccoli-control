# Deployment notes

Broccoli Control Token is a simple ERC20 fixture intended for Sepolia and local wallet QA only.

## Inputs

Use local shell environment variables. Never commit real values.

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_RPC_URL` | RPC endpoint used by `forge script`. |
| `PRIVATE_KEY` | Testnet deployer key. This account becomes token owner and receives initial supply. |
| `ETHERSCAN_API_KEY` | Optional verification key. |

## Build and test before deployment

```bash
forge fmt --check
forge build
forge test
```

## Deploy

```bash
cp .env.example .env
# edit placeholders locally
set -a
source .env
set +a
forge script script/Deploy.s.sol:Deploy --rpc-url "$SEPOLIA_RPC_URL" --broadcast -vvvv
```

To verify at deployment time:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  -vvvv
```

## Wire frontend

After deployment, set browser-safe values in `.env.local` or the hosting provider:

```bash
NEXT_PUBLIC_TOKEN_ADDRESS=<deployed token address>
NEXT_PUBLIC_CHAIN_ID=11155111
```

Restart/rebuild the frontend after changing public environment variables.

## Operational notes

- The deployer is the token owner.
- `INITIAL_SUPPLY` is minted to the deployer.
- `mint(address,uint256)` is owner-only and exists for fixture reset/top-up workflows.
- Treat broadcast artifacts as public transaction metadata; review before sharing.
