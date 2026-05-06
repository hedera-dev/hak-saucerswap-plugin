# Tools

This document describes every tool registered by the SaucerSwap plugin in a format aligned with
[`HEDERATOOLS.md`](https://github.com/hashgraph/hedera-agent-kit-js/blob/main/docs/HEDERATOOLS.md)
from the Hedera Agent Kit.

Tools fall into two groups:

- **Query tools** — call the SaucerSwap REST API; do not submit transactions to Hedera.
- **Transaction tools** — build a `ContractExecuteTransaction` and dispatch it through the agent
  kit's `handleTransaction` helper. The result depends on `context.mode`:
    - `AgentMode.AUTONOMOUS` → executes the transaction and returns receipt data.
    - `AgentMode.RETURN_BYTES` → returns frozen transaction bytes for external signing.

For configuration of the underlying API key and router contract IDs, see
[`CONFIGURATION.md`](./CONFIGURATION.md).

## Index

- [`saucerswap_get_swap_quote`](#saucerswap_get_swap_quote)
- [`saucerswap_swap_tokens`](#saucerswap_swap_tokens)
- [`saucerswap_get_pools`](#saucerswap_get_pools)
- [`saucerswap_add_liquidity`](#saucerswap_add_liquidity)
- [`saucerswap_remove_liquidity`](#saucerswap_remove_liquidity)
- [`saucerswap_get_farms`](#saucerswap_get_farms)

---

## `saucerswap_get_swap_quote`

**Type**: Query

**Description**: Get a price quote for swapping tokens on SaucerSwap, including expected output,
price impact, and a slippage-adjusted minimum.

**Parameters**:

| Name                | Type     | Required | Default | Description                                                                  |
| ------------------- | -------- | -------- | ------- | ---------------------------------------------------------------------------- |
| `fromToken`         | `string` | Yes      | —       | Token ID, alias (e.g. `"HBAR"`), or symbol resolvable via the SaucerSwap API. |
| `toToken`           | `string` | Yes      | —       | Token ID, alias, or symbol resolvable via the SaucerSwap API.                |
| `amount`            | `string` | Yes      | —       | Decimal-format amount of `fromToken` to quote (e.g. `"1.5"`).                |
| `slippageTolerance` | `number` | No       | `0.5`   | Maximum slippage tolerance, in percent.                                      |

**Returns**:

```ts
{
  success: true,
  quote: {
    amountIn: string,
    expectedOutput: string,
    priceImpact: number | null,
    route: string[],
    raw: unknown,        // raw payload from the SaucerSwap API
  },
  minOutput: string | null,  // expectedOutput adjusted by slippageTolerance
}
```

On failure (e.g. API error, unknown token):

```ts
{ success: false, error: string }
```

**Example prompts**:

- "Get a quote to swap 100 HBAR into SAUCE."
- "What's the expected output for trading 0.5 USDC to HBAR?"
- "Quote a 1000 SAUCE → USDC swap with 1% slippage."

**Notes & errors**:

- `priceImpact` is `null` when the API doesn't supply it. The plugin attempts to compute it from
  pool reserves before falling back to `null`.
- Token aliases configured via `tokenAliases` are resolved before the API call.

---

## `saucerswap_swap_tokens`

**Type**: Transaction

**Description**: Build (and optionally execute) a token swap on SaucerSwap with slippage
protection. Routes through the configured v1 or v2 router based on `defaultPoolVersion`.

**Parameters**:

| Name                | Type     | Required | Default                       | Description                                                                                  |
| ------------------- | -------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `fromToken`         | `string` | Yes      | —                             | Token ID, alias, or symbol of the input token.                                               |
| `toToken`           | `string` | Yes      | —                             | Token ID, alias, or symbol of the output token.                                              |
| `amount`            | `string` | Yes      | —                             | Decimal-format amount of `fromToken` to swap.                                                |
| `slippageTolerance` | `number` | No       | `0.5`                         | Maximum slippage tolerance, in percent.                                                      |
| `deadline`          | `number` | No       | `deadlineMinutes` from config | Either minutes from now, or a Unix timestamp (in seconds) more than 60 seconds in the future. |

**Returns** (`AgentMode.AUTONOMOUS`):

```ts
{
  raw: {
    status: string,
    transactionId: string,
    accountId: AccountId | null,
    tokenId: TokenId | null,
    topicId: TopicId | null,
    scheduleId: ScheduleId | null,
  },
  humanMessage: string,    // "SaucerSwap swap submitted. Status: ..."
  estimatedOutput: string,
  minOutput: string,
  priceImpact: number | null,
  route: string[],
}
```

**Returns** (`AgentMode.RETURN_BYTES`):

```ts
{
  bytes: Uint8Array,        // frozen transaction bytes
  estimatedOutput: string,
  minOutput: string,
  priceImpact: number | null,
  route: string[],
}
```

On configuration or pre-flight failure (e.g. missing operator, missing router contract):

```ts
{ success: false, error: string }
```

**Example prompts**:

- "Swap 25 HBAR for SAUCE."
- "Trade 10 USDC into HBAR with 0.3% slippage."
- "Convert 500 SAUCE to USDC and set a 30-minute deadline."

**Notes & errors**:

- The Hedera client must have an operator account configured; otherwise the tool returns an error
  result without building a transaction.
- The router contract ID corresponding to `defaultPoolVersion` must be configured.

---

## `saucerswap_get_pools`

**Type**: Query

**Description**: List SaucerSwap liquidity pools. Optionally filter by a token pair and/or a
specific pool version.

**Parameters**:

| Name      | Type             | Required | Default                         | Description                                          |
| --------- | ---------------- | -------- | ------------------------------- | ---------------------------------------------------- |
| `tokenA`  | `string`         | No       | —                               | First token (ID, alias, or symbol). Pair filter.     |
| `tokenB`  | `string`         | No       | —                               | Second token (ID, alias, or symbol). Pair filter.    |
| `version` | `"v1" \| "v2"`   | No       | `defaultPoolVersion` from config | Pool version to query.                               |
| `limit`   | `number` (>0)    | No       | —                               | Maximum number of pools to return.                   |

**Returns**:

```ts
{
  success: true,
  version: "v1" | "v2",
  pools: ApiLiquidityPool[],   // see src/types.ts for the full shape
}
```

On failure:

```ts
{ success: false, error: string }
```

**Example prompts**:

- "List all SaucerSwap v2 pools."
- "Show me the first 5 v1 pools."
- "Find the pool for HBAR / USDC."

**Notes**:

- The pair filter matches in either direction (`A↔B` or `B↔A`).
- Pass either both `tokenA` and `tokenB` or neither — a single token is ignored.

---

## `saucerswap_add_liquidity`

**Type**: Transaction

**Description**: Add liquidity to a SaucerSwap pool, computing minimum amounts from the requested
slippage tolerance.

**Parameters**:

| Name                | Type     | Required | Default | Description                                              |
| ------------------- | -------- | -------- | ------- | -------------------------------------------------------- |
| `tokenA`            | `string` | Yes      | —       | First token (ID, alias, or symbol).                      |
| `tokenB`            | `string` | Yes      | —       | Second token (ID, alias, or symbol).                     |
| `amountA`           | `string` | Yes      | —       | Decimal-format amount of `tokenA` to deposit.            |
| `amountB`           | `string` | Yes      | —       | Decimal-format amount of `tokenB` to deposit.            |
| `slippageTolerance` | `number` | No       | `0.5`   | Maximum slippage tolerance, in percent.                  |

**Returns** (`AgentMode.AUTONOMOUS`):

```ts
{
  raw: { status, transactionId, ... },
  humanMessage: string,        // "SaucerSwap add liquidity submitted. ..."
  amountADesired: string,      // input amounts in smallest units
  amountBDesired: string,
  amountAMin: string,          // slippage-adjusted minimums
  amountBMin: string,
}
```

**Returns** (`AgentMode.RETURN_BYTES`):

```ts
{ bytes: Uint8Array, amountADesired, amountBDesired, amountAMin, amountBMin }
```

On configuration failure: `{ success: false, error: string }`.

**Example prompts**:

- "Add liquidity: 100 HBAR and 50 USDC to the SaucerSwap pool."
- "Deposit 1000 SAUCE and 25 HBAR into the SAUCE/HBAR pool with 1% slippage."

**Notes & errors**:

- Requires a configured operator account on the Hedera client.
- The router contract ID corresponding to `defaultPoolVersion` must be configured.
- The token pair must already exist as a pool — this tool does not create new pools.

---

## `saucerswap_remove_liquidity`

**Type**: Transaction

**Description**: Burn LP tokens to redeem the underlying pair. The minimum receive amounts are
provided explicitly by the caller.

**Parameters**:

| Name            | Type     | Required | Default | Description                                                              |
| --------------- | -------- | -------- | ------- | ------------------------------------------------------------------------ |
| `tokenA`        | `string` | Yes      | —       | First token of the pool (ID, alias, or symbol).                          |
| `tokenB`        | `string` | Yes      | —       | Second token of the pool (ID, alias, or symbol).                         |
| `lpTokenAmount` | `string` | Yes      | —       | Decimal-format amount of LP tokens to burn.                              |
| `minAmountA`    | `string` | Yes      | —       | Minimum amount of `tokenA` accepted (decimal-format, slippage protection). |
| `minAmountB`    | `string` | Yes      | —       | Minimum amount of `tokenB` accepted (decimal-format, slippage protection). |

**Returns** (`AgentMode.AUTONOMOUS`):

```ts
{
  raw: { status, transactionId, ... },
  humanMessage: string,    // "SaucerSwap remove liquidity submitted. ..."
  lpAmount: string,
  minAmountA: string,
  minAmountB: string,
}
```

**Returns** (`AgentMode.RETURN_BYTES`):

```ts
{ bytes: Uint8Array, lpAmount, minAmountA, minAmountB }
```

On failure (no pool found, missing operator, etc.): `{ success: false, error: string }`.

**Example prompts**:

- "Remove 10 LP tokens from the HBAR/USDC pool, accepting at least 4 HBAR and 1 USDC back."
- "Burn 500 SAUCE-HBAR LP tokens with minimum receive of 250 SAUCE and 5 HBAR."

**Notes**:

- This tool resolves the LP token decimals from the pool metadata — the input `lpTokenAmount` is
  in display units, not tiny units.
- The pool for the given pair must exist on the configured `defaultPoolVersion`.

---

## `saucerswap_get_farms`

**Type**: Query

**Description**: List active farming opportunities on SaucerSwap.

**Parameters**:

| Name     | Type    | Required | Default | Description                                |
| -------- | ------- | -------- | ------- | ------------------------------------------ |
| `poolId` | `number` (>0) | No  | —       | Optional pool ID to filter farms by.       |

**Returns**:

```ts
{ success: true, farms: ApiFarm[] }
```

On failure: `{ success: false, error: string }`.

**Example prompts**:

- "What farms are currently active on SaucerSwap?"
- "Show me the farm for pool 12 only."

---

## Common error patterns

All tools return a plain `{ success: false, error: string }` object when:

- The Hedera client has no configured operator (transaction tools).
- A required router contract ID is missing for the active pool version.
- The SaucerSwap API call fails (network error, 4xx/5xx, malformed response).
- A supplied token cannot be resolved against the SaucerSwap API or `tokenAliases`.

These error results bypass `secondaryAction` — no transaction is built and nothing is sent to the
network. Inspect `result.error` to surface the failure reason to the user.
