import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { createSaucerSwapClient } from "../api/client";
import { resolveSaucerSwapConfig } from "../config";
import { applySlippageToAmount, calculatePriceImpact } from "../utils/amm";
import { normalizeSwapQuote } from "../utils/quote";
import { normalizeTokenAlias } from "../utils/tokens";

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
  description = "Get a price quote for swapping tokens on SaucerSwap.";
  parameters = quoteInputSchema;

  async normalizeParams(
    params: QuoteInput,
    _context: Context,
    _client: Client,
  ): Promise<QuoteInput> {
    return quoteInputSchema.parse(params);
  }

  async coreAction(args: QuoteInput, context: Context, _client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const cachedApi = (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
      .saucerswapClient;
    const api = cachedApi ?? createSaucerSwapClient(config);
    const slippageTolerance = args.slippageTolerance ?? 0.5;

    try {
      const fromToken = normalizeTokenAlias(args.fromToken, config);
      const toToken = normalizeTokenAlias(args.toToken, config);
      const fromTokenId = await api.resolveTokenId(fromToken);
      const toTokenId = await api.resolveTokenId(toToken);
      const rawQuote = await api.getSwapQuote({
        fromToken: fromTokenId,
        toToken: toTokenId,
        amount: args.amount,
      });

      const normalized = normalizeSwapQuote(rawQuote, args.amount);

      if (normalized.priceImpact === null) {
        const pool = await api.getPoolByTokens(fromTokenId, toTokenId, config.defaultPoolVersion);
        if (pool && rawQuote.amountIn && rawQuote.amountOut) {
          const isAToB = pool.tokenA.id === fromTokenId;
          const reserveIn = isAToB ? pool.tokenReserveA : pool.tokenReserveB;
          const reserveOut = isAToB ? pool.tokenReserveB : pool.tokenReserveA;
          normalized.priceImpact = calculatePriceImpact(
            rawQuote.amountIn,
            rawQuote.amountOut,
            reserveIn,
            reserveOut,
          );
        }
      }

      let minOutput: string | null = null;
      if (normalized.expectedOutput.includes(".")) {
        const expectedNumber = Number(normalized.expectedOutput);
        minOutput = Number.isFinite(expectedNumber)
          ? (expectedNumber * (1 - slippageTolerance / 100)).toString()
          : null;
      } else {
        minOutput = applySlippageToAmount(normalized.expectedOutput, slippageTolerance);
      }

      return {
        success: true,
        quote: normalized,
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
