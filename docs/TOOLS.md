# Tools

This document describes every tool registered by the SaucerSwap plugin in a format aligned with
[`HEDERATOOLS.md`](https://github.com/hashgraph/hedera-agent-kit-js/blob/main/docs/HEDERATOOLS.md)
from the Hedera Agent Kit.

Tools fall into two groups:

- **Query tools**: call the SaucerSwap REST API or, for quotes, read the SaucerSwap V1 router
  through the Hedera mirror node; do not submit transactions to Hedera.
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

**Description**: Get an on-chain price quote for an exact-input swap on the SaucerSwap V1 router,
including expected output, price impact, and a slippage-adjusted minimum.

The quote comes from the router's `getAmountsOut(uint256,address[])`, executed as a read-only
call through the mirror node `POST /api/v1/contracts/call`. This is free and needs no API key.
SaucerSwap does not offer a REST quote endpoint (`/v1/swap/quote` returns 404).

**Parameters**:

| Name                | Type     | Required | Default | Description                                                                              |
| ------------------- | -------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `fromToken`         | `string` | Yes      | n/a     | `"HBAR"` for native HBAR, a token ID, an alias, or a symbol resolvable via the SaucerSwap API. |
| `toToken`           | `string` | Yes      | n/a     | Same as `fromToken`.                                                                     |
| `amount`            | `string` | Yes      | n/a     | Decimal-format amount of `fromToken` to quote (e.g. `"1.5"`).                            |
| `slippageTolerance` | `number` | No       | `0.5`   | Maximum slippage tolerance, in percent.                                                  |

**Returns**:

```ts
{
  success: true,
  quote: {
    amountIn: string,          // decimal units of fromToken
    expectedOutput: string,    // decimal units of toToken
    priceImpact: number | null,
    route: string[],           // e.g. ["HBAR", "0.0.731861"]
    raw: {
      routerContractId: string,
      path: string[],          // token IDs; WHBAR stands in for native HBAR
      amounts: string[],       // getAmountsOut result in smallest units
    },
  },
  minOutput: string,           // expectedOutput minus slippageTolerance, decimal units
}
```

On failure (e.g. unknown token, no pool for the pair, missing V1 router):

```ts
{ success: false, error: string }
```

**Example prompts**:

- "Get a quote to swap 100 HBAR into SAUCE."
- "What's the expected output for trading 0.5 USDC to HBAR?"
- "Quote a 1000 SAUCE to USDC swap with 1% slippage."

**Notes & errors**:

- The quoter tries the direct pair and, when neither side is WHBAR, a two-hop route through
  WHBAR, and returns whichever yields more output.
- `priceImpact` is measured against the spot price implied by each pool's `getReserves()`, so it
  includes the 0.3% LP fee per hop. It is `null` when the reserves cannot be read.
- Token decimals come from the SaucerSwap API token list, falling back to the mirror node.
- The mirror node URL follows `network` (or the client's ledger); override it with
  `mirrorNodeUrl`. See [`CONFIGURATION.md`](./CONFIGURATION.md).

---

## `saucerswap_swap_tokens`

**Type**: Transaction

**Description**: Build (and optionally execute) an exact-input swap on the SaucerSwap V1 router
with slippage protection. The quote is taken on-chain exactly as in `saucerswap_get_swap_quote`.

The router function depends on the token pair:

| From | To   | Router function            | Payable amount |
| ---- | ---- | -------------------------- | -------------- |
| HBAR | HTS  | `swapExactETHForTokens`    | `amount` HBAR  |
| HTS  | HBAR | `swapExactTokensForETH`    | none           |
| HTS  | HTS  | `swapExactTokensForTokens` | none           |

**Parameters**:

| Name                | Type     | Required | Default                       | Description                                                                                  |
| ------------------- | -------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `fromToken`         | `string` | Yes      | n/a                           | `"HBAR"` for native HBAR, or a token ID, alias, or symbol of the input token.                |
| `toToken`           | `string` | Yes      | n/a                           | `"HBAR"` for native HBAR, or a token ID, alias, or symbol of the output token.               |
| `amount`            | `string` | Yes      | n/a                           | Decimal-format amount of `fromToken` to swap.                                                |
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
  estimatedOutput: string, // decimal units of toToken
  minOutput: string,       // decimal units of toToken, enforced on-chain as amountOutMin
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

Before the transaction is dispatched, `coreAction` returns
`{ transaction, extras: { estimatedOutput, minOutput, priceImpact, route } }`, which is the shape
hooks and policies (for example `hak-jev-plugin`) inspect.

On configuration or pre-flight failure (e.g. missing operator, missing V1 router, missing
allowance):

```ts
{ success: false, error: string }
```

**Example prompts**:

- "Swap 25 HBAR for SAUCE."
- "Trade 10 USDC into HBAR with 0.3% slippage."
- "Convert 500 SAUCE to USDC and set a 30-minute deadline."

**Router allowance for HTS input**:

The router pulls HTS input tokens from the operator with `transferFrom`, so the operator must
first grant the router contract's account a fungible token allowance of at least `amount`. HBAR
input needs no allowance. Before building an HTS-input swap the tool reads the current allowance
from the mirror node and, if it is too low, returns an error that names the token, spender and
required amount instead of submitting a transaction that would revert. Grant it with the Hedera
Agent Kit core `approve_token_allowance_tool` (spender = the V1 router ID, e.g. `0.0.3045981` on
mainnet, `0.0.19264` on testnet), or with the SDK:

```ts
await new AccountAllowanceApproveTransaction()
  .approveTokenAllowance(tokenId, operatorId, "0.0.3045981", amountInSmallestUnits)
  .execute(client);
```

The mirror node can take a few seconds to reflect a new allowance. If the allowance lookup itself
fails, the swap is built anyway and the network decides.

**Notes & errors**:

- The Hedera client must have an operator account configured; otherwise the tool returns an error
  result without building a transaction. Output is sent to the operator account, which must be
  associated with the output token (or have a free auto-association slot).
- Swaps always use the V1 router (`routerContractId`), whatever `defaultPoolVersion` says. The V2
  router has a different interface and is not used for swaps.
- `wrappedHbarTokenId` is required whenever either side is HBAR.

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

**Description**: Add liquidity to an existing SaucerSwap V1 pool through the V1 router, computing
minimum amounts from the requested slippage tolerance. Either side may be native HBAR.

| Pair       | Router function   | Payable amount     |
| ---------- | ----------------- | ------------------ |
| HTS + HTS  | `addLiquidity`    | none               |
| HBAR + HTS | `addLiquidityETH` | the HBAR amount    |

**Parameters**:

| Name                | Type     | Required | Default | Description                                                     |
| ------------------- | -------- | -------- | ------- | --------------------------------------------------------------- |
| `tokenA`            | `string` | Yes      | n/a     | `"HBAR"` for native HBAR, or a token ID, alias, or symbol.      |
| `tokenB`            | `string` | Yes      | n/a     | `"HBAR"` for native HBAR, or a token ID, alias, or symbol.      |
| `amountA`           | `string` | Yes      | n/a     | Decimal-format amount of `tokenA` to deposit.                   |
| `amountB`           | `string` | Yes      | n/a     | Decimal-format amount of `tokenB` to deposit.                   |
| `slippageTolerance` | `number` | No       | `0.5`   | Maximum slippage tolerance, in percent.                         |

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

On configuration or pre-flight failure (missing operator, missing V1 router, missing allowance):
`{ success: false, error: string }`.

**Example prompts**:

- "Add liquidity: 100 HBAR and 50 USDC to the SaucerSwap pool."
- "Deposit 1000 SAUCE and 25 HBAR into the SAUCE/HBAR pool with 1% slippage."

**Router allowance**:

The router pulls each HTS token it deposits with `transferFrom`, so the operator must first grant
the V1 router a token allowance of at least the deposit amount for every HTS side. The HBAR side
needs no allowance. The tool checks the allowances on the mirror node and returns an error listing
each missing one (token, spender and amount) instead of submitting a transaction that would revert.
Grant them with the Hedera Agent Kit `approve_token_allowance_tool`, as described for
[`saucerswap_swap_tokens`](#saucerswap_swap_tokens).

**Notes & errors**:

- Requires a configured operator account on the Hedera client. LP tokens are sent to the operator,
  which must be associated with the LP token (or have a free auto-association slot).
- Always uses the V1 router (`routerContractId`), whatever `defaultPoolVersion` says. The V2
  router is a concentrated-liquidity router with a different interface.
- The token pair must already exist as a V1 pool. This tool does not create new pools.

---

## `saucerswap_remove_liquidity`

**Type**: Transaction

**Description**: Burn V1 LP tokens through the V1 router to redeem the underlying pair. The
minimum receive amounts are provided explicitly by the caller. Either side may be native HBAR.

| Pair       | Router function      |
| ---------- | -------------------- |
| HTS + HTS  | `removeLiquidity`    |
| HBAR + HTS | `removeLiquidityETH` |

**Parameters**:

| Name            | Type     | Required | Default | Description                                                                |
| --------------- | -------- | -------- | ------- | -------------------------------------------------------------------------- |
| `tokenA`        | `string` | Yes      | n/a     | First token of the pool: `"HBAR"`, or a token ID, alias, or symbol.        |
| `tokenB`        | `string` | Yes      | n/a     | Second token of the pool: `"HBAR"`, or a token ID, alias, or symbol.       |
| `lpTokenAmount` | `string` | Yes      | n/a     | Decimal-format amount of LP tokens to burn.                                |
| `minAmountA`    | `string` | Yes      | n/a     | Minimum amount of `tokenA` accepted (decimal-format, slippage protection). |
| `minAmountB`    | `string` | Yes      | n/a     | Minimum amount of `tokenB` accepted (decimal-format, slippage protection). |

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

On failure (no V1 pool found, missing operator, missing LP allowance, etc.):
`{ success: false, error: string }`.

**Example prompts**:

- "Remove 10 LP tokens from the HBAR/USDC pool, accepting at least 4 HBAR and 1 USDC back."
- "Burn 500 SAUCE-HBAR LP tokens with minimum receive of 250 SAUCE and 5 HBAR."

**Router allowance**:

The LP token is an HTS token (for example `0.0.2656383` for HBAR/SAUCE on testnet) that the router
pulls from the operator, so the operator must first grant the V1 router an allowance of at least
`lpTokenAmount` for it. The tool checks it on the mirror node and returns approval instructions
when it is missing.

**Notes**:

- The pool and its LP token are looked up in the SaucerSwap API's V1 pool list, whatever
  `defaultPoolVersion` says. `lpTokenAmount` is in display units, not tiny units.
- Always uses the V1 router (`routerContractId`).
- The operator must be associated with any HTS token it receives back.

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
