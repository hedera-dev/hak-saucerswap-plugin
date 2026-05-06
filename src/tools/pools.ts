import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { createSaucerSwapClient } from "../api/client";
import { resolveSaucerSwapConfig } from "../config";
import { normalizeTokenAlias } from "../utils/tokens";

const poolsInputSchema = z.object({
  tokenA: z.string().optional().describe("First token ID or symbol"),
  tokenB: z.string().optional().describe("Second token ID or symbol"),
  version: z.enum(["v1", "v2"]).optional().describe("Pool version"),
  limit: z.number().int().positive().optional().describe("Maximum number of pools to return"),
});

type PoolsInput = z.infer<typeof poolsInputSchema>;

export class PoolsTool extends BaseTool<PoolsInput, PoolsInput> {
  method = "saucerswap_get_pools";
  name = "SaucerSwap Get Pools";
  description = "Query SaucerSwap liquidity pools and reserves.";
  parameters = poolsInputSchema;

  async normalizeParams(
    params: PoolsInput,
    _context: Context,
    _client: Client,
  ): Promise<PoolsInput> {
    return poolsInputSchema.parse(params);
  }

  async coreAction(args: PoolsInput, context: Context, _client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const api =
      (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
        .saucerswapClient ?? createSaucerSwapClient(config);

    try {
      const version = args.version ?? config.defaultPoolVersion;
      const pools = await api.getPools(version);

      let filtered = pools;
      if (args.tokenA && args.tokenB) {
        const tokenA = normalizeTokenAlias(args.tokenA, config);
        const tokenB = normalizeTokenAlias(args.tokenB, config);
        const tokenAId = await api.resolveTokenId(tokenA);
        const tokenBId = await api.resolveTokenId(tokenB);
        filtered = pools.filter((pool) => {
          const direct = pool.tokenA.id === tokenAId && pool.tokenB.id === tokenBId;
          const inverse = pool.tokenA.id === tokenBId && pool.tokenB.id === tokenAId;
          return direct || inverse;
        });
      }

      if (args.limit && args.limit > 0) {
        filtered = filtered.slice(0, args.limit);
      }

      return {
        success: true,
        version,
        pools: filtered,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  override async shouldSecondaryAction(_coreActionResult: unknown, _context: Context) {
    return false;
  }

  async secondaryAction(_request: unknown, _client: Client, _context: Context) {
    return null;
  }
}

export const poolsTool = new PoolsTool();
