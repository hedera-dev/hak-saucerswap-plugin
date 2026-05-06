# Configuration

The plugin reads configuration from two sources:

1. **Plugin config** — `context.config.saucerswap.<key>` (or `context.pluginConfig.saucerswap.<key>`)
   passed to the agent kit when constructing the agent.
2. **Environment variables** — read at call time from `process.env`.

## Precedence

For each setting, values are resolved in the following order (highest priority first):

1. Plugin config (`context.config.saucerswap.<key>`)
2. Environment variable
3. Built-in default

This means a per-agent override in plugin config always wins over an environment variable.
Setting nothing falls back to the documented default.

## Reference

See [`.env.example`](../.env.example) for a ready-to-copy template.

| Setting             | Config Key            | Env Variable                        | Description                                                                                  | Required                                  | Default                            |
| ------------------- | --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| API key             | `apiKey`              | `SAUCERSWAP_API_KEY`                | API key forwarded as the `x-api-key` header on every request.                                | Yes — required by the SaucerSwap API.     | _(none)_                           |
| Router (v1)         | `routerContractId`    | `SAUCERSWAP_ROUTER_CONTRACT_ID`     | Hedera contract ID of the v1 SaucerSwap router. Used by swap and liquidity tools.            | Yes if `defaultPoolVersion` is `v1`.      | _(none)_                           |
| Router (v2)         | `routerV2ContractId`  | `SAUCERSWAP_ROUTER_V2_CONTRACT_ID`  | Hedera contract ID of the v2 SaucerSwap router.                                              | Yes if `defaultPoolVersion` is `v2`.      | _(none)_                           |
| Wrapped HBAR        | `wrappedHbarTokenId`  | `SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID`  | Token ID for WHBAR — used to resolve HBAR↔token swap paths.                                  | Yes for any swap or quote involving HBAR. | _(none)_                           |
| Default pool ver.   | `defaultPoolVersion`  | `SAUCERSWAP_DEFAULT_POOL_VERSION`   | Pool version used when a tool call doesn't specify one. Either `v1` or `v2`.                 | No                                        | `v2`                               |
| Token aliases       | `tokenAliases`        | `SAUCERSWAP_TOKEN_ALIASES`          | Map of human-readable symbols to token IDs. Env variable must be a JSON string.              | No                                        | `{}`                               |
| Base URL            | `baseUrl`             | `SAUCERSWAP_BASE_URL`               | Base URL of the SaucerSwap REST API.                                                         | No                                        | `https://api.saucerswap.finance`   |
| Request timeout     | `timeoutMs`           | `SAUCERSWAP_TIMEOUT_MS`             | Network timeout for SaucerSwap API requests, in milliseconds.                                | No                                        | `10000`                            |
| Retries             | `retries`             | `SAUCERSWAP_RETRIES`                | Number of retries for transient SaucerSwap API failures.                                     | No                                        | `2`                                |
| Gas limit           | `gasLimit`            | `SAUCERSWAP_GAS_LIMIT`              | Gas limit applied to contract execute transactions for swaps and liquidity actions.          | No                                        | `2000000`                          |
| Deadline            | `deadlineMinutes`     | `SAUCERSWAP_DEADLINE_MINUTES`       | Default transaction deadline (in minutes) for swap and liquidity actions.                    | No                                        | `20`                               |

## Contract addresses

Always verify router and WHBAR token IDs against the official SaucerSwap deployment list:

[https://docs.saucerswap.finance/developerx/contract-deployments](https://docs.saucerswap.finance/developerx/contract-deployments)

The plugin does **not** ship hardcoded addresses — every deployment must supply the IDs that
match the Hedera network it targets.

## Examples

### Environment-only setup

```bash
export SAUCERSWAP_API_KEY=your_saucerswap_api_key
export SAUCERSWAP_ROUTER_V2_CONTRACT_ID=0.0.1414040
export SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID=0.0.15058
```

### Plugin-config setup

```ts
import { saucerswapPlugin } from "hak-saucerswap-plugin";

const agent = new HederaAgent({
  plugins: [saucerswapPlugin],
  config: {
    saucerswap: {
      apiKey: process.env.SAUCERSWAP_API_KEY,
      routerContractId: "0.0.2230930",
      routerV2ContractId: "0.0.1414040",
      wrappedHbarTokenId: "0.0.15058",
      tokenAliases: { HBAR: "0.0.15058", USDC: "0.0.1183558" },
      defaultPoolVersion: "v2",
    },
  },
});
```

### Mixed setup (env for secrets, config for IDs)

```bash
# .env
SAUCERSWAP_API_KEY=your_saucerswap_api_key
```

```ts
const agent = new HederaAgent({
  plugins: [saucerswapPlugin],
  config: {
    saucerswap: {
      routerV2ContractId: "0.0.1414040",
      wrappedHbarTokenId: "0.0.15058",
    },
  },
});
```

The API key resolves from the environment; router and WHBAR IDs come from plugin config.
