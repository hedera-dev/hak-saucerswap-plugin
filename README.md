# Hedera Agent Kit - SaucerSwap Plugin

A plugin for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) that integrates with
[SaucerSwap](https://saucerswap.finance) to enable token swaps, liquidity management, and farm
insights on Hedera.

## Overview

SaucerSwap is Hedera's leading DEX with deep liquidity and active DeFi opportunities. This plugin
lets AI agents:

- Execute swaps with slippage protection
- Fetch swap quotes and price impact estimates
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
import { saucerswapPlugin } from "hak-saucerswap-plugin";

const agent = new HederaAgent({
  plugins: [saucerswapPlugin],
  config: {
    saucerswap: {
      apiKey: process.env.SAUCERSWAP_API_KEY,
      routerV2ContractId: "0.0.1414040",
      wrappedHbarTokenId: "0.0.15058",
    },
  },
});
```

The SaucerSwap API requires an `x-api-key` header. Get a key from
[saucerswap.finance](https://www.saucerswap.finance) and supply it via either
`SAUCERSWAP_API_KEY` in the environment or `config.saucerswap.apiKey`. See
[`.env.example`](./.env.example) for a copy-paste template of all supported environment variables.

## Development

```bash
npm run build
npm run test
npm run lint
```

## License

MIT
