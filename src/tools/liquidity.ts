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
import {
  accountIdToSolidityAddress,
  contractIdFromString,
  normalizeTokenAlias,
  requireTokenId,
  tokenIdToSolidityAddress,
} from "../utils/tokens";
import { parseUnits } from "../utils/units";

const addLiquidityInputSchema = z.object({
  tokenA: z.string().describe("First token ID"),
  tokenB: z.string().describe("Second token ID"),
  amountA: z.string().describe("Amount of tokenA to add"),
  amountB: z.string().describe("Amount of tokenB to add"),
  slippageTolerance: z
    .number()
    .optional()
    .default(0.5)
    .describe("Maximum slippage tolerance percentage"),
});

const removeLiquidityInputSchema = z.object({
  tokenA: z.string().describe("First token ID"),
  tokenB: z.string().describe("Second token ID"),
  lpTokenAmount: z.string().describe("Amount of LP tokens to burn"),
  minAmountA: z.string().describe("Minimum amount of tokenA to receive"),
  minAmountB: z.string().describe("Minimum amount of tokenB to receive"),
});

type AddLiquidityInput = z.infer<typeof addLiquidityInputSchema>;
type RemoveLiquidityInput = z.infer<typeof removeLiquidityInputSchema>;

type AddLiquidityExtras = {
  amountADesired: string;
  amountBDesired: string;
  amountAMin: string;
  amountBMin: string;
};

type RemoveLiquidityExtras = {
  lpAmount: string;
  minAmountA: string;
  minAmountB: string;
};

type LiquidityCorePayload<E> = {
  transaction: Transaction;
  extras: E;
};

const isLiquidityCorePayload = (
  value: unknown,
): value is LiquidityCorePayload<Record<string, unknown>> =>
  typeof value === "object" && value !== null && "transaction" in value;

const addLiquidityPostProcess = (response: RawTransactionResponse) =>
  `SaucerSwap add liquidity submitted. Status: ${response.status}. Transaction ID: ${response.transactionId}`;

const removeLiquidityPostProcess = (response: RawTransactionResponse) =>
  `SaucerSwap remove liquidity submitted. Status: ${response.status}. Transaction ID: ${response.transactionId}`;

const resolveDeadline = (defaultMinutes: number): number => {
  return Math.floor(Date.now() / 1000) + defaultMinutes * 60;
};

const resolveRouterContract = (config: ReturnType<typeof resolveSaucerSwapConfig>): string => {
  const routerContractId =
    config.defaultPoolVersion === "v2"
      ? (config.routerV2ContractId ?? config.routerContractId)
      : (config.routerContractId ?? config.routerV2ContractId);
  if (!routerContractId) {
    throw new Error("Missing SaucerSwap router contract ID configuration.");
  }
  return routerContractId;
};

export class AddLiquidityTool extends BaseTool<AddLiquidityInput, AddLiquidityInput> {
  method = "saucerswap_add_liquidity";
  name = "SaucerSwap Add Liquidity";
  description = "Add liquidity to a SaucerSwap pool.";
  parameters = addLiquidityInputSchema;

  async normalizeParams(
    params: AddLiquidityInput,
    _context: Context,
    _client: Client,
  ): Promise<AddLiquidityInput> {
    return addLiquidityInputSchema.parse(params);
  }

  async coreAction(args: AddLiquidityInput, context: Context, client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const operatorAccountId = client?.operatorAccountId?.toString();
    const slippageTolerance = args.slippageTolerance ?? 0.5;

    if (!operatorAccountId) {
      return {
        success: false,
        error: "Hedera client with an operator account is required for liquidity actions.",
      };
    }

    try {
      const api =
        (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
          .saucerswapClient ?? createSaucerSwapClient(config);

      const tokenAInput = normalizeTokenAlias(args.tokenA, config);
      const tokenBInput = normalizeTokenAlias(args.tokenB, config);
      const tokenAId = await api.resolveTokenId(tokenAInput);
      const tokenBId = await api.resolveTokenId(tokenBInput);

      const tokenA = await api.getTokenByIdOrSymbol(tokenAId);
      const tokenB = await api.getTokenByIdOrSymbol(tokenBId);

      if (!tokenA || !tokenB) {
        return {
          success: false,
          error: "Unable to resolve token metadata from SaucerSwap API.",
        };
      }

      const amountADesired = parseUnits(args.amountA, tokenA.decimals);
      const amountBDesired = parseUnits(args.amountB, tokenB.decimals);
      const amountAMin = applySlippageToAmount(amountADesired, slippageTolerance);
      const amountBMin = applySlippageToAmount(amountBDesired, slippageTolerance);

      const routerContractId = resolveRouterContract(config);
      const deadline = resolveDeadline(config.deadlineMinutes);
      const toAddress = accountIdToSolidityAddress(operatorAccountId);

      const params = new ContractFunctionParameters()
        .addAddress(tokenIdToSolidityAddress(requireTokenId(tokenAId)))
        .addAddress(tokenIdToSolidityAddress(requireTokenId(tokenBId)))
        .addUint256(amountADesired)
        .addUint256(amountBDesired)
        .addUint256(amountAMin)
        .addUint256(amountBMin)
        .addAddress(toAddress)
        .addUint256(deadline);

      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit)
        .setFunction("addLiquidity", params);

      const payload: LiquidityCorePayload<AddLiquidityExtras> = {
        transaction,
        extras: { amountADesired, amountBDesired, amountAMin, amountBMin },
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
    return isLiquidityCorePayload(coreActionResult);
  }

  async secondaryAction(
    payload: LiquidityCorePayload<AddLiquidityExtras>,
    client: Client,
    context: Context,
  ) {
    const result = await handleTransaction(
      payload.transaction,
      client,
      context,
      addLiquidityPostProcess,
    );
    return { ...result, ...payload.extras };
  }
}

export class RemoveLiquidityTool extends BaseTool<RemoveLiquidityInput, RemoveLiquidityInput> {
  method = "saucerswap_remove_liquidity";
  name = "SaucerSwap Remove Liquidity";
  description = "Remove liquidity from a SaucerSwap pool.";
  parameters = removeLiquidityInputSchema;

  async normalizeParams(
    params: RemoveLiquidityInput,
    _context: Context,
    _client: Client,
  ): Promise<RemoveLiquidityInput> {
    return removeLiquidityInputSchema.parse(params);
  }

  async coreAction(args: RemoveLiquidityInput, context: Context, client: Client) {
    const config = resolveSaucerSwapConfig(context);
    const operatorAccountId = client?.operatorAccountId?.toString();

    if (!operatorAccountId) {
      return {
        success: false,
        error: "Hedera client with an operator account is required for liquidity actions.",
      };
    }

    try {
      const api =
        (context as { saucerswapClient?: ReturnType<typeof createSaucerSwapClient> })
          .saucerswapClient ?? createSaucerSwapClient(config);

      const tokenAInput = normalizeTokenAlias(args.tokenA, config);
      const tokenBInput = normalizeTokenAlias(args.tokenB, config);
      const tokenAId = await api.resolveTokenId(tokenAInput);
      const tokenBId = await api.resolveTokenId(tokenBInput);

      const pool = await api.getPoolByTokens(tokenAId, tokenBId, config.defaultPoolVersion);
      if (!pool) {
        return {
          success: false,
          error: "Unable to locate pool for the provided token pair.",
        };
      }

      const tokenA = await api.getTokenByIdOrSymbol(tokenAId);
      const tokenB = await api.getTokenByIdOrSymbol(tokenBId);
      if (!tokenA || !tokenB) {
        return {
          success: false,
          error: "Unable to resolve token metadata from SaucerSwap API.",
        };
      }

      const lpAmount = parseUnits(args.lpTokenAmount, pool.lpToken.decimals);
      const minAmountA = parseUnits(args.minAmountA, tokenA.decimals);
      const minAmountB = parseUnits(args.minAmountB, tokenB.decimals);

      const routerContractId = resolveRouterContract(config);
      const deadline = resolveDeadline(config.deadlineMinutes);
      const toAddress = accountIdToSolidityAddress(operatorAccountId);

      const params = new ContractFunctionParameters()
        .addAddress(tokenIdToSolidityAddress(requireTokenId(tokenAId)))
        .addAddress(tokenIdToSolidityAddress(requireTokenId(tokenBId)))
        .addUint256(lpAmount)
        .addUint256(minAmountA)
        .addUint256(minAmountB)
        .addAddress(toAddress)
        .addUint256(deadline);

      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit)
        .setFunction("removeLiquidity", params);

      const payload: LiquidityCorePayload<RemoveLiquidityExtras> = {
        transaction,
        extras: { lpAmount, minAmountA, minAmountB },
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
    return isLiquidityCorePayload(coreActionResult);
  }

  async secondaryAction(
    payload: LiquidityCorePayload<RemoveLiquidityExtras>,
    client: Client,
    context: Context,
  ) {
    const result = await handleTransaction(
      payload.transaction,
      client,
      context,
      removeLiquidityPostProcess,
    );
    return { ...result, ...payload.extras };
  }
}

export const addLiquidityTool = new AddLiquidityTool();
export const removeLiquidityTool = new RemoveLiquidityTool();
