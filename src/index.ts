import type { Plugin } from "@hashgraph/hedera-agent-kit";
import { farmsTool } from "./tools/farms";
import { addLiquidityTool, removeLiquidityTool } from "./tools/liquidity";
import { poolsTool } from "./tools/pools";
import { quoteTool } from "./tools/quote";
import { swapTool } from "./tools/swap";

export const saucerswapPluginToolNames = {
  SAUCERSWAP_GET_SWAP_QUOTE_TOOL: "saucerswap_get_swap_quote",
  SAUCERSWAP_SWAP_TOKENS_TOOL: "saucerswap_swap_tokens",
  SAUCERSWAP_GET_POOLS_TOOL: "saucerswap_get_pools",
  SAUCERSWAP_ADD_LIQUIDITY_TOOL: "saucerswap_add_liquidity",
  SAUCERSWAP_REMOVE_LIQUIDITY_TOOL: "saucerswap_remove_liquidity",
  SAUCERSWAP_GET_FARMS_TOOL: "saucerswap_get_farms",
} as const;

export const saucerswapPlugin: Plugin = {
  name: "saucerswap",
  description:
    "Integration with SaucerSwap DEX for token swaps, liquidity provision, and yield farming",
  tools: () => [swapTool, quoteTool, poolsTool, addLiquidityTool, removeLiquidityTool, farmsTool],
};

export { saucerswapPlugin as default };
