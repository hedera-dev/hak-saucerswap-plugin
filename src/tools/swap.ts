import {
  BaseTool,
  type Context,
  handleTransaction,
  type RawTransactionResponse,
} from "@hashgraph/hedera-agent-kit";
import {
  type Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Transaction,
} from "@hiero-ledger/sdk";
import { z } from "zod";
import { createSaucerSwapClient } from "../api/client";
import { resolveSaucerSwapConfig } from "../config";
import { applySlippageToAmount } from "../utils/amm";
import { normalizeSwapQuote } from "../utils/quote";
import {
  accountIdToSolidityAddress,
  contractIdFromString,
  normalizeTokenAlias,
  requireTokenId,
  tokenIdToSolidityAddress,
} from "../utils/tokens";
import { parseUnits } from "../utils/units";

const swapInputSchema = z.object({
  fromToken: z.string().describe("Token ID to swap from (e.g., 'HBAR' or '0.0.123456')"),
  toToken: z.string().describe("Token ID to swap to"),
  amount: z.string().describe("Amount to swap (decimal format)"),
  slippageTolerance: z
    .number()
    .optional()
    .default(0.5)
    .describe("Maximum slippage tolerance percentage"),
  deadline: z
    .number()
    .optional()
    .describe("Transaction deadline in minutes from now or a unix timestamp"),
});

type SwapInput = z.infer<typeof swapInputSchema>;

type SwapExtras = {
  estimatedOutput: string;
  minOutput: string;
  priceImpact: number | null;
  route: string[];
};

type SwapCorePayload = {
  transaction: Transaction;
  extras: SwapExtras;
};

const isSwapCorePayload = (value: unknown): value is SwapCorePayload =>
  typeof value === "object" && value !== null && "transaction" in value;

const swapPostProcess = (response: RawTransactionResponse) =>
  `SaucerSwap swap submitted. Status: ${response.status}. Transaction ID: ${response.transactionId}`;

const resolveDeadline = (deadlineInput: number | undefined, defaultMinutes: number): number => {
  const now = Math.floor(Date.now() / 1000);
  if (!deadlineInput) {
    return now + defaultMinutes * 60;
  }
  if (deadlineInput > now + 60) {
    return Math.floor(deadlineInput);
  }
  return now + Math.round(deadlineInput) * 60;
};

const amountToSmallest = (amount: string, decimals: number): string => {
  return parseUnits(amount, decimals);
};

const expectedToSmallest = (amount: string, decimals: number): string => {
  return amount.includes(".") ? parseUnits(amount, decimals) : amount;
};

export class SwapTool extends BaseTool<SwapInput, SwapInput> {
  method = "saucerswap_swap_tokens";
  name = "SaucerSwap Swap Tokens";
  description = "Execute a token swap on SaucerSwap DEX.";
  parameters = swapInputSchema;

  async normalizeParams(params: SwapInput, _context: Context, _client: Client): Promise<SwapInput> {
    return swapInputSchema.parse(params);
  }

  async coreAction(args: SwapInput, context: Context, client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const operatorAccountId = client?.operatorAccountId?.toString();
    const slippageTolerance = args.slippageTolerance ?? 0.5;

    if (!operatorAccountId) {
      return {
        success: false,
        error: "Hedera client with an operator account is required for swaps.",
      };
    }

    try {
      const api =
        (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
          .saucerswapClient ?? createSaucerSwapClient(config);

      const fromTokenAlias = normalizeTokenAlias(args.fromToken, config);
      const toTokenAlias = normalizeTokenAlias(args.toToken, config);
      const fromTokenId = await api.resolveTokenId(fromTokenAlias);
      const toTokenId = await api.resolveTokenId(toTokenAlias);

      const fromTokenMeta = await api.getTokenByIdOrSymbol(fromTokenId);
      const toTokenMeta = await api.getTokenByIdOrSymbol(toTokenId);

      if (!fromTokenMeta || !toTokenMeta) {
        return {
          success: false,
          error: "Unable to resolve token metadata from SaucerSwap API.",
        };
      }

      const quote = normalizeSwapQuote(
        await api.getSwapQuote({
          fromToken: fromTokenId,
          toToken: toTokenId,
          amount: args.amount,
        }),
        args.amount,
      );

      const amountInSmallest = amountToSmallest(args.amount, fromTokenMeta.decimals);
      const expectedOutSmallest = expectedToSmallest(quote.expectedOutput, toTokenMeta.decimals);
      const minOutSmallest = applySlippageToAmount(expectedOutSmallest, slippageTolerance);

      const routerContractId =
        config.defaultPoolVersion === "v2"
          ? (config.routerV2ContractId ?? config.routerContractId)
          : (config.routerContractId ?? config.routerV2ContractId);

      if (!routerContractId) {
        return {
          success: false,
          error: "Missing SaucerSwap router contract ID configuration.",
        };
      }

      const deadline = resolveDeadline(args.deadline, config.deadlineMinutes);
      const toAddress = accountIdToSolidityAddress(operatorAccountId);
      const path = [
        tokenIdToSolidityAddress(requireTokenId(fromTokenId)),
        tokenIdToSolidityAddress(requireTokenId(toTokenId)),
      ];

      const params = new ContractFunctionParameters()
        .addUint256(amountInSmallest)
        .addUint256(minOutSmallest)
        .addAddressArray(path)
        .addAddress(toAddress)
        .addUint256(deadline);

      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit)
        .setFunction("swapExactTokensForTokens", params);

      const payload: SwapCorePayload = {
        transaction,
        extras: {
          estimatedOutput: quote.expectedOutput,
          minOutput: minOutSmallest,
          priceImpact: quote.priceImpact,
          route: quote.route,
        },
      };
      return payload;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  override async shouldSecondaryAction(coreActionResult: unknown, _context: Context) {
    return isSwapCorePayload(coreActionResult);
  }

  async secondaryAction(payload: SwapCorePayload, client: Client, context: Context) {
    const result = await handleTransaction(
      payload.transaction,
      client,
      context,
      swapPostProcess,
    );
    return { ...result, ...payload.extras };
  }
}

export const swapTool = new SwapTool();
