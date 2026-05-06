import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { createSaucerSwapClient } from "../api/client";
import { resolveSaucerSwapConfig } from "../config";

const farmsInputSchema = z.object({
  poolId: z.number().int().positive().optional().describe("Optional pool ID to filter farms"),
});

type FarmsInput = z.infer<typeof farmsInputSchema>;

export class FarmsTool extends BaseTool<FarmsInput, FarmsInput> {
  method = "saucerswap_get_farms";
  name = "SaucerSwap Get Farms";
  description = "Get active farming opportunities on SaucerSwap.";
  parameters = farmsInputSchema;

  async normalizeParams(
    params: FarmsInput,
    _context: Context,
    _client: Client,
  ): Promise<FarmsInput> {
    return farmsInputSchema.parse(params);
  }

  async coreAction(args: FarmsInput, context: Context, _client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const api =
      (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
        .saucerswapClient ?? createSaucerSwapClient(config);

    try {
      const farms = await api.getFarms();
      const filtered = args.poolId ? farms.filter((farm) => farm.poolId === args.poolId) : farms;

      return {
        success: true,
        farms: filtered,
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

export const farmsTool = new FarmsTool();
