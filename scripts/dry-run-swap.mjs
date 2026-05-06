import { existsSync } from "node:fs";
import { Client } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { saucerswapPlugin } from "../dist/index.js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const resolveNetworkClient = (network) => {
  switch (network) {
    case "mainnet":
      return Client.forMainnet();
    case "previewnet":
      return Client.forPreviewnet();
    default:
      return Client.forTestnet();
  }
};

const run = async () => {
  if (!existsSync(new URL("../dist/index.js", import.meta.url))) {
    throw new Error("Build artifacts not found. Run `npm run build` first.");
  }
  const accountId = requiredEnv("HEDERA_ACCOUNT_ID");
  const privateKey = requiredEnv("HEDERA_PRIVATE_KEY");
  const fromToken = requiredEnv("SAUCERSWAP_SWAP_FROM");
  const toToken = requiredEnv("SAUCERSWAP_SWAP_TO");
  const amount = requiredEnv("SAUCERSWAP_SWAP_AMOUNT");
  const slippageTolerance = process.env.SAUCERSWAP_SLIPPAGE
    ? Number(process.env.SAUCERSWAP_SLIPPAGE)
    : 0.5;

  const routerContractId = process.env.SAUCERSWAP_ROUTER_CONTRACT_ID;
  const routerV2ContractId = process.env.SAUCERSWAP_ROUTER_V2_CONTRACT_ID;
  if (!routerContractId && !routerV2ContractId) {
    throw new Error(
      "Missing SaucerSwap router contract ID: set SAUCERSWAP_ROUTER_CONTRACT_ID or SAUCERSWAP_ROUTER_V2_CONTRACT_ID.",
    );
  }

  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  const client = resolveNetworkClient(network);
  client.setOperator(accountId, privateKey);

  const context = {
    mode: AgentMode.RETURN_BYTES,
    config: {
      saucerswap: {
        routerContractId,
        routerV2ContractId,
        wrappedHbarTokenId: process.env.SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID,
      },
    },
  };

  const tools = saucerswapPlugin.tools(context);
  const swapTool = tools.find((tool) => tool.method === "saucerswap_swap_tokens");
  if (!swapTool) {
    throw new Error("Swap tool not registered.");
  }

  const result = await swapTool.execute(client, context, {
    fromToken,
    toToken,
    amount,
    slippageTolerance,
  });

  console.log(JSON.stringify(result, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
