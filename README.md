# Hedera Agent Kit - SaucerSwap Plugin

A plugin for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) that integrates with
[SaucerSwap](https://saucerswap.finance) to enable token swaps, liquidity management, and farm
insights on Hedera.

## Overview

SaucerSwap is Hedera's leading DEX with deep liquidity and active DeFi opportunities. This plugin
lets AI agents:

- Execute swaps with slippage protection, with HBAR or HTS tokens on either side
- Fetch on-chain swap quotes and price impact from the SaucerSwap V1 router (via the mirror node)
- Query pool reserves and token metadata
- Add/remove liquidity via router transactions
- Discover farming opportunities

## Documentation

- **[Configuration](./docs/CONFIGURATION.md)** — full settings table, env vs. plugin-config
  precedence, and pointers to the official SaucerSwap contract deployment list.
- **[Tools](./docs/TOOLS.md)** — per-tool reference (parameters, return shape, example prompts,
  error behavior) for all six tools registered by the plugin.
- **[Examples](./docs/EXAMPLES.md)** — dry-run swap, CLI wrapper, and integration smoke test.

## Installation

```bash
npm install hak-saucerswap-plugin
```

## Quick Start

```ts
import { saucerswapPlugin, SAUCERSWAP_MAINNET } from "hak-saucerswap-plugin";

const agent = new HederaAgent({
  plugins: [saucerswapPlugin],
  config: {
    saucerswap: {
      ...SAUCERSWAP_MAINNET,
      apiKey: process.env.SAUCERSWAP_API_KEY,
    },
  },
});
```

Or use the `network` shorthand and set `SAUCERSWAP_NETWORK=mainnet` in your environment — no
contract addresses needed:

```ts
const agent = new HederaAgent({
  plugins: [saucerswapPlugin],
  config: {
    saucerswap: { network: "mainnet", apiKey: process.env.SAUCERSWAP_API_KEY },
  },
});
```

The SaucerSwap API requires an `x-api-key` header. Get a key from
[saucerswap.finance](https://www.saucerswap.finance) and supply it via either
`SAUCERSWAP_API_KEY` in the environment or `config.saucerswap.apiKey`. See
[`.env.example`](./.env.example) for a copy-paste template of all supported environment variables.

## Swapping HTS tokens

Quotes and swaps go through the SaucerSwap V1 router. Swapping **from HBAR** works out of the box.
Swapping **from an HTS token** requires the operator to grant the router a token allowance first
(for example with the Hedera Agent Kit `approve_token_allowance_tool`); the swap tool checks the
allowance and tells the agent exactly what to approve when it is missing. See
[`docs/TOOLS.md`](./docs/TOOLS.md#saucerswap_swap_tokens).

## Network Defaults

The plugin ships with official contract addresses for both networks. Import the constants
directly or use the `network` shorthand — individual fields always take precedence if set.

| Export               | Network | routerContractId | routerV2ContractId | wrappedHbarTokenId |
|----------------------|---------|------------------|--------------------|-------------------|
| `SAUCERSWAP_MAINNET` | mainnet | `0.0.3045981`    | `0.0.3949434`      | `0.0.1456986`     |
| `SAUCERSWAP_TESTNET` | testnet | `0.0.19264`      | `0.0.1414040`      | `0.0.15058`       |

Both constants also include `tokenAliases` for `SAUCE` and `XSAUCE`. Contract addresses sourced
from the [official SaucerSwap deployment docs](https://docs.saucerswap.finance/developerx/contract-deployments).

## Development

```bash
npm run build
npm run test
npm run lint
```

## License

MIT
