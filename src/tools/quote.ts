import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { resolveSaucerSwapConfig } from "../config";
import type { SwapQuote } from "../types";
import { applySlippageToAmount } from "../utils/amm";
import { prepareSwapQuote, resolveApiClients } from "../utils/swap-quote";
import { formatUnits } from "../utils/units";

const quoteInputSchema = z.object({
  fromToken: z.string().describe("Token ID to swap from (e.g., 'HBAR' or '0.0.123456')"),
  toToken: z.string().describe("Token ID to swap to"),
  amount: z.string().describe("Amount to swap (decimal format)"),
  slippageTolerance: z
    .number()
    .optional()
    .default(0.5)
    .describe("Maximum slippage tolerance percentage"),
});

type QuoteInput = z.infer<typeof quoteInputSchema>;

export class QuoteTool extends BaseTool<QuoteInput, QuoteInput> {
  method = "saucerswap_get_swap_quote";
  name = "SaucerSwap Get Swap Quote";
  description =
    "Get an on-chain price quote for swapping tokens on the SaucerSwap V1 router, with price impact and a slippage-adjusted minimum output.";
  parameters = quoteInputSchema;

  async normalizeParams(
    params: QuoteInput,
    _context: Context,
    _client: Client,
  ): Promise<QuoteInput> {
    return quoteInputSchema.parse(params);
  }

  async coreAction(args: QuoteInput, context: Context, client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const slippageTolerance = args.slippageTolerance ?? 0.5;

    try {
      const { api, mirror } = resolveApiClients(context, config, client);
      const prepared = await prepareSwapQuote({
        fromToken: args.fromToken,
        toToken: args.toToken,
        amount: args.amount,
        config,
        api,
        mirror,
      });

      const quote: SwapQuote = {
        amountIn: formatUnits(prepared.quote.amountIn.toString(), prepared.from.decimals),
        expectedOutput: prepared.expectedOutput,
        priceImpact: prepared.quote.priceImpact,
        route: prepared.route,
        raw: {
          routerContractId: prepared.routerContractId,
          path: prepared.quote.path,
          amounts: prepared.quote.amounts.map((amount) => amount.toString()),
        },
      };
      const minOutput = formatUnits(
        applySlippageToAmount(prepared.quote.amountOut.toString(), slippageTolerance),
        prepared.to.decimals,
      );

      return {
        success: true,
        quote,
        minOutput,
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

export const quoteTool = new QuoteTool();
