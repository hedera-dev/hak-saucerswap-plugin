# Examples

## Dry-Run Swap

Build a swap transaction without executing it by setting `mode` to `returnBytes`. The result
includes `bytes` (the frozen, ready-to-sign transaction) and pre-computed swap metadata.

```ts
import { Client } from "@hiero-ledger/sdk";
import { saucerswapPlugin } from "@your-org/hak-saucerswap-plugin";

const client = Client.forTestnet();
client.setOperator(process.env.HEDERA_ACCOUNT_ID!, process.env.HEDERA_PRIVATE_KEY!);

const context = { mode: "returnBytes" };
const tools = saucerswapPlugin.tools(context);
const swapTool = tools.find((tool) => tool.method === "saucerswap_swap_tokens");

if (!swapTool) {
  throw new Error("Swap tool not registered.");
}

const result = await swapTool.execute(client, context, {
  fromToken: "0.0.123456",
  toToken: "0.0.654321",
  amount: "1.5",
  slippageTolerance: 0.5,
});

console.log(result);
```

## Built-in CLI Wrapper

Run the bundled dry-run CLI after building the plugin:

```bash
npm run build

export HEDERA_NETWORK=testnet
export HEDERA_ACCOUNT_ID=0.0.1234
export HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
export SAUCERSWAP_API_KEY=your_saucerswap_api_key
export SAUCERSWAP_ROUTER_CONTRACT_ID=0.0.123456
export SAUCERSWAP_SWAP_FROM=0.0.111111
export SAUCERSWAP_SWAP_TO=0.0.222222
export SAUCERSWAP_SWAP_AMOUNT=1.5

npm run dry-run:swap
```

## Integration Smoke Test

Hit the SaucerSwap API and print basic counts:

```bash
npm run test:integration
```

Optional environment overrides:

```bash
export SAUCERSWAP_BASE_URL=https://api.saucerswap.finance
export SAUCERSWAP_TEST_FROM_TOKEN=0.0.123456
export SAUCERSWAP_TEST_TO_TOKEN=0.0.654321
export SAUCERSWAP_TEST_AMOUNT=1
```
