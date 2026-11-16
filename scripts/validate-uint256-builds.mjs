import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as sdkEsm from "@hiero-ledger/sdk";
import * as esm from "../dist/index.js";

const require = createRequire(import.meta.url);
const max = (1n << 256n) - 1n;
const variants = [
  ["ESM", esm, sdkEsm],
  ["CJS", require("../dist/index.cjs"), require("@hiero-ledger/sdk")],
];
for (const [name, mod, sdk] of variants) {
  const tool = mod.saucerswapPlugin
    .tools()
    .find((candidate) => candidate.method === "saucerswap_add_liquidity");
  const context = {
    config: { saucerswap: { routerContractId: "0.0.19264" } },
    saucerswapClient: {
      resolveTokenId: async (id) => id,
      getTokenByIdOrSymbol: async (id) => ({ id, decimals: 0 }),
    },
    saucerswapMirrorClient: {
      getTokenAllowance: async () => max + 1n,
      getAccountEvmAddress: async (id) => sdk.AccountId.fromString(id).toEvmAddress(),
    },
  };
  const client = { operatorAccountId: { toString: () => "0.0.1001" } };
  const args = { tokenA: "0.0.100", tokenB: "0.0.101", amountB: "1", slippageTolerance: 0 };
  for (const value of [0n, 1n << 64n, max]) {
    const result = await tool.coreAction({ ...args, amountA: value.toString() }, context, client);
    assert.ok(result.transaction, JSON.stringify(result));
    const tx = result.transaction
      .setNodeAccountIds([sdk.AccountId.fromString("0.0.3")])
      .setTransactionId(sdk.TransactionId.generate("0.0.1001"))
      .freeze();
    const restored = sdk.Transaction.fromBytes(tx.toBytes());
    const hex = Buffer.from(restored.functionParameters).toString("hex");
    assert.equal(BigInt(`0x${hex.slice(8 + 64 * 2, 8 + 64 * 3)}`), value);
  }
  const overflow = await tool.coreAction(
    { ...args, amountA: (max + 1n).toString() },
    context,
    client,
  );
  assert.equal(overflow.success, false);
  assert.match(overflow.error, /256-bit range/);
  console.log(
    `${name}: production bundle exact uint256 transaction roundtrip and overflow rejection passed`,
  );
}
