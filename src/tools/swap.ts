import {
  BaseTool,
  type Context,
  type RawTransactionResponse,
  handleTransaction,
} from "@hashgraph/hedera-agent-kit";
import {
  type Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  type Transaction,
} from "@hiero-ledger/sdk";
import { z } from "zod";
import { resolveSaucerSwapConfig } from "../config";
import { findMissingAllowances } from "../utils/allowance";
import { applySlippageToAmount } from "../utils/amm";
import { prepareSwapQuote, resolveApiClients } from "../utils/swap-quote";
import {
  accountIdToSolidityAddress,
  contractIdFromString,
  tokenIdToSolidityAddress,
} from "../utils/tokens";
import { formatUnits, toUint256 } from "../utils/units";

const swapInputSchema = z.object({
  fromToken: z
    .string()
    .describe(
      "Token to swap from: 'HBAR' for native HBAR, or a token ID/symbol. HTS tokens need a token allowance for the SaucerSwap V1 router first.",
    ),
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

export class SwapTool extends BaseTool<SwapInput, SwapInput> {
  method = "saucerswap_swap_tokens";
  name = "SaucerSwap Swap Tokens";
  description =
    "Execute an exact-input token swap on the SaucerSwap V1 router. Supports HBAR and HTS tokens on either side. Swapping from an HTS token requires a prior token allowance for the router.";
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
      const { api, mirror } = resolveApiClients(context, config, client);
      const { from, to, quote, routerContractId, expectedOutput, route } = await prepareSwapQuote({
        fromToken: args.fromToken,
        toToken: args.toToken,
        amount: args.amount,
        config,
        api,
        mirror,
      });

      // Fail early with instructions instead of submitting a transaction that reverts.
      if (!from.isHbar) {
        const error = await findMissingAllowances(mirror, operatorAccountId, routerContractId, [
          { tokenId: from.tokenId, amount: quote.amountIn, decimals: from.decimals },
        ]);
        if (error) {
          return { success: false, error };
        }
      }

      const minOutSmallest = applySlippageToAmount(quote.amountOut.toString(), slippageTolerance);
      const deadline = resolveDeadline(args.deadline, config.deadlineMinutes);
      const recipient = accountIdToSolidityAddress(operatorAccountId);
      const path = quote.path.map(tokenIdToSolidityAddress);

      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit);

      if (from.isHbar) {
        transaction
          .setPayableAmount(Hbar.fromTinybars(quote.amountIn.toString()))
          .setFunction(
            "swapExactETHForTokens",
            new ContractFunctionParameters()
              .addUint256(toUint256(minOutSmallest))
              .addAddressArray(path)
              .addAddress(recipient)
              .addUint256(toUint256(deadline)),
          );
      } else {
        transaction.setFunction(
          to.isHbar ? "swapExactTokensForETH" : "swapExactTokensForTokens",
          new ContractFunctionParameters()
            .addUint256(toUint256(quote.amountIn.toString()))
            .addUint256(toUint256(minOutSmallest))
            .addAddressArray(path)
            .addAddress(recipient)
            .addUint256(toUint256(deadline)),
        );
      }

      const payload: SwapCorePayload = {
        transaction,
        extras: {
          estimatedOutput: expectedOutput,
          minOutput: formatUnits(minOutSmallest, to.decimals),
          priceImpact: quote.priceImpact,
          route,
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
    const result = await handleTransaction(payload.transaction, client, context, swapPostProcess);
    return { ...result, ...payload.extras };
  }
}

export const swapTool = new SwapTool();
