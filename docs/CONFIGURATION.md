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
| Router (v1)         | `routerContractId`    | `SAUCERSWAP_ROUTER_CONTRACT_ID`     | Hedera contract ID of the v1 SaucerSwap router. Used for quotes, swaps and liquidity. | Yes for quotes, swaps and liquidity (set by `network`). | _(none)_                           |
| Router (v2)         | `routerV2ContractId`  | `SAUCERSWAP_ROUTER_V2_CONTRACT_ID`  | Hedera contract ID of the v2 SaucerSwap router. Not used by the transaction tools, which all use v1. | No                                        | _(none)_                           |
| Wrapped HBAR        | `wrappedHbarTokenId`  | `SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID`  | Token ID for WHBAR — used to resolve HBAR↔token swap paths.                                  | Yes for any swap or quote involving HBAR. | _(none)_                           |
| Default pool ver.   | `defaultPoolVersion`  | `SAUCERSWAP_DEFAULT_POOL_VERSION`   | Pool version used when a tool call doesn't specify one. Either `v1` or `v2`.                 | No                                        | `v2`                               |
| Token aliases       | `tokenAliases`        | `SAUCERSWAP_TOKEN_ALIASES`          | Map of human-readable symbols to token IDs. Env variable must be a JSON string.              | No                                        | `{}`                               |
| Base URL            | `baseUrl`             | `SAUCERSWAP_BASE_URL`               | Base URL of the SaucerSwap REST API.                                                         | No                                        | `https://api.saucerswap.finance`   |
| Mirror node URL     | `mirrorNodeUrl`       | `SAUCERSWAP_MIRROR_NODE_URL`        | Hedera mirror node used for on-chain quotes (`/api/v1/contracts/call`), token decimals and allowance checks. | No                                        | Follows `network`, then the client's ledger, then mainnet (`https://mainnet-public.mirrornode.hedera.com`) |
| Request timeout     | `timeoutMs`           | `SAUCERSWAP_TIMEOUT_MS`             | Network timeout for SaucerSwap API requests, in milliseconds.                                | No                                        | `10000`                            |
| Retries             | `retries`             | `SAUCERSWAP_RETRIES`                | Number of retries for transient SaucerSwap API failures.                                     | No                                        | `2`                                |
| Gas limit           | `gasLimit`            | `SAUCERSWAP_GAS_LIMIT`              | Gas limit applied to contract execute transactions for swaps and liquidity actions.          | No                                        | `2000000`                          |
| Deadline            | `deadlineMinutes`     | `SAUCERSWAP_DEADLINE_MINUTES`       | Default transaction deadline (in minutes) for swap and liquidity actions.                    | No                                        | `20`                               |

## Contract addresses

Always verify router and WHBAR token IDs against the official SaucerSwap deployment list:

[https://docs.saucerswap.finance/developerx/contract-deployments](https://docs.saucerswap.finance/developerx/contract-deployments)

Setting `network` selects bundled router and WHBAR defaults from `src/networks.ts`.
Explicit IDs override those defaults. Verify every override against the intended network;
set `network` explicitly rather than relying only on the SDK client ledger.

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


When `network` / `SAUCERSWAP_NETWORK` is explicitly `testnet`, the default API
base URL is `https://test-api.saucerswap.finance`, so V1 pool and LP metadata come
from the same network as the router. Mainnet (and an unspecified network) retains
`https://api.saucerswap.finance`. Explicit context/environment API URL overrides
still take precedence; ensure any override belongs to the intended network.

For liquidity removal, estimate gas for the exact call before submission and set
`gasLimit` explicitly. The default 2,000,000 was insufficient for a testnet
HBAR/SAUCE removal that included router token association/dissociation; its
read-only estimate exceeded 2.6 million gas. This is an example, not a universal
recommended limit. Retain a deliberate cap and margin rather than blindly
increasing gas after a revert. Budget contract gas separately from the SDK's
nominal maximum transaction fee and verify charged fees from the receipt/record.


## Gas budgets and uncertain submissions

`gasLimit` caps gas units, not a total HBAR spending budget. The plugin does not
estimate gas automatically or enforce a combined transaction-fee/gas budget.
Before signing, estimate the **exact** calldata, canonical sender, recipient and
payable amount with the target network's mirror `/api/v1/contracts/call` using
`estimate: true`. Apply a bounded margin and compare the estimated gas cost,
transaction fee, payable amount and any approval/cleanup costs to an explicit
application budget. Stop if estimation fails or the budget would be exceeded.
Mirror estimates depend on state and do not guarantee execution success.

Do not treat SDK `setMaxTransactionFee` as a cap on the complete contract gas
charge. Confirm the total charged fee from consensus records/mirror data.
A timeout after submission is an **unknown outcome**, not permission to retry:
save the transaction ID before submitting, resolve its receipt/record and expiry,
and never automatically resubmit a swap or liquidity action with a new ID.

## Transport validation limits

The controlled testnet validation used the plugin's `coreAction` transaction
builders and the official SDK browser gRPC-Web transport. In this VM, native
Node gRPC connections dropped and default Axios REST requests intermittently
returned HTTP 502. Read-only REST requests in that validation used injected
clients backed by curl, with independently verified testnet pool metadata.
Those adapters are **not** included in this package. No proxy, TLS or firewall
settings were changed. This does not establish that the default Axios/native
Node transport works end-to-end in every deployment.

Before deployment, validate both the mirror/API read-only requests and the
intended SDK transport in the target environment. A mirror lookup failure must
stop transaction construction; never substitute a numeric long-zero recipient
for an unresolved canonical EVM address. Agent Kit's complete `execute` /
`secondaryAction` approval modes were not exercised by the controlled testnet
harness. Validate those separately before enabling automated execution.
