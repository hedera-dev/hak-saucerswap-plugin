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
import type { SaucerSwapConfig } from "../types";
import { findMissingAllowances } from "../utils/allowance";
import { applySlippageToAmount } from "../utils/amm";
import {
  type MirrorLookup,
  type ResolvedSwapToken,
  type TokenLookup,
  requireV1Router,
  resolveApiClients,
  resolveToken,
} from "../utils/swap-quote";
import {
  accountIdToSolidityAddress,
  contractIdFromString,
  tokenIdToSolidityAddress,
} from "../utils/tokens";
import { parseUnits, toUint256 } from "../utils/units";

const addLiquidityInputSchema = z.object({
  tokenA: z.string().describe("First token: 'HBAR' for native HBAR, or a token ID/symbol"),
  tokenB: z.string().describe("Second token: 'HBAR' for native HBAR, or a token ID/symbol"),
  amountA: z.string().describe("Amount of tokenA to add"),
  amountB: z.string().describe("Amount of tokenB to add"),
  slippageTolerance: z
    .number()
    .optional()
    .default(0.5)
    .describe("Maximum slippage tolerance percentage"),
});

const removeLiquidityInputSchema = z.object({
  tokenA: z.string().describe("First token: 'HBAR' for native HBAR, or a token ID/symbol"),
  tokenB: z.string().describe("Second token: 'HBAR' for native HBAR, or a token ID/symbol"),
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

const resolveLiquidityTokens = async (
  tokenA: string,
  tokenB: string,
  config: SaucerSwapConfig,
  api: TokenLookup,
  mirror: MirrorLookup,
): Promise<[ResolvedSwapToken, ResolvedSwapToken]> => {
  const a = await resolveToken(tokenA, config, api, mirror);
  const b = await resolveToken(tokenB, config, api, mirror);
  if (a.tokenId === b.tokenId) {
    throw new Error("tokenA and tokenB resolve to the same token.");
  }
  return [a, b];
};

export class AddLiquidityTool extends BaseTool<AddLiquidityInput, AddLiquidityInput> {
  method = "saucerswap_add_liquidity";
  name = "SaucerSwap Add Liquidity";
  description =
    "Add liquidity to an existing SaucerSwap V1 pool. Supports HBAR as one side. HTS tokens need a token allowance for the SaucerSwap V1 router first.";
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
      const { api, mirror } = resolveApiClients(context, config, client);
      const [tokenA, tokenB] = await resolveLiquidityTokens(
        args.tokenA,
        args.tokenB,
        config,
        api,
        mirror,
      );

      const amountADesired = parseUnits(args.amountA, tokenA.decimals);
      const amountBDesired = parseUnits(args.amountB, tokenB.decimals);
      const amountAMin = applySlippageToAmount(amountADesired, slippageTolerance);
      const amountBMin = applySlippageToAmount(amountBDesired, slippageTolerance);

      const routerContractId = requireV1Router(config);
      const allowanceError = await findMissingAllowances(
        mirror,
        operatorAccountId,
        routerContractId,
        [
          { token: tokenA, amount: amountADesired },
          { token: tokenB, amount: amountBDesired },
        ]
          .filter(({ token }) => !token.isHbar)
          .map(({ token, amount }) => ({
            tokenId: token.tokenId,
            amount: BigInt(amount),
            decimals: token.decimals,
          })),
      );
      if (allowanceError) {
        return { success: false, error: allowanceError };
      }

      const deadline = resolveDeadline(config.deadlineMinutes);
      const toAddress = accountIdToSolidityAddress(operatorAccountId);
      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit);

      if (tokenA.isHbar || tokenB.isHbar) {
        // addLiquidityETH(token, amountTokenDesired, amountTokenMin, amountETHMin, to, deadline)
        const [hts, htsDesired, htsMin, hbarDesired, hbarMin] = tokenA.isHbar
          ? [tokenB, amountBDesired, amountBMin, amountADesired, amountAMin]
          : [tokenA, amountADesired, amountAMin, amountBDesired, amountBMin];
        transaction
          .setPayableAmount(Hbar.fromTinybars(hbarDesired))
          .setFunction(
            "addLiquidityETH",
            new ContractFunctionParameters()
              .addAddress(tokenIdToSolidityAddress(hts.tokenId))
              .addUint256(toUint256(htsDesired))
              .addUint256(toUint256(htsMin))
              .addUint256(toUint256(hbarMin))
              .addAddress(toAddress)
              .addUint256(toUint256(deadline)),
          );
      } else {
        transaction.setFunction(
          "addLiquidity",
          new ContractFunctionParameters()
            .addAddress(tokenIdToSolidityAddress(tokenA.tokenId))
            .addAddress(tokenIdToSolidityAddress(tokenB.tokenId))
            .addUint256(toUint256(amountADesired))
            .addUint256(toUint256(amountBDesired))
            .addUint256(toUint256(amountAMin))
            .addUint256(toUint256(amountBMin))
            .addAddress(toAddress)
            .addUint256(toUint256(deadline)),
        );
      }

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
  description =
    "Remove liquidity from a SaucerSwap V1 pool. Supports HBAR as one side. The LP token needs a token allowance for the SaucerSwap V1 router first.";
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
      const { api, mirror } = resolveApiClients(context, config, client);
      const [tokenA, tokenB] = await resolveLiquidityTokens(
        args.tokenA,
        args.tokenB,
        config,
        api,
        mirror,
      );

      // Liquidity lives in V1 pools; the LP token is an HTS token the router pulls on removal.
      const pool = await api.getPoolByTokens(tokenA.tokenId, tokenB.tokenId, "v1");
      if (!pool) {
        return {
          success: false,
          error: "Unable to locate a SaucerSwap V1 pool for the provided token pair.",
        };
      }

      const lpAmount = parseUnits(args.lpTokenAmount, pool.lpToken.decimals);
      const minAmountA = parseUnits(args.minAmountA, tokenA.decimals);
      const minAmountB = parseUnits(args.minAmountB, tokenB.decimals);

      const routerContractId = requireV1Router(config);
      const allowanceError = await findMissingAllowances(
        mirror,
        operatorAccountId,
        routerContractId,
        [{ tokenId: pool.lpToken.id, amount: BigInt(lpAmount), decimals: pool.lpToken.decimals }],
      );
      if (allowanceError) {
        return { success: false, error: allowanceError };
      }

      const deadline = resolveDeadline(config.deadlineMinutes);
      const toAddress = accountIdToSolidityAddress(operatorAccountId);
      const transaction = new ContractExecuteTransaction()
        .setContractId(contractIdFromString(routerContractId))
        .setGas(config.gasLimit);

      if (tokenA.isHbar || tokenB.isHbar) {
        // removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline)
        const [hts, htsMin, hbarMin] = tokenA.isHbar
          ? [tokenB, minAmountB, minAmountA]
          : [tokenA, minAmountA, minAmountB];
        transaction.setFunction(
          "removeLiquidityETH",
          new ContractFunctionParameters()
            .addAddress(tokenIdToSolidityAddress(hts.tokenId))
            .addUint256(toUint256(lpAmount))
            .addUint256(toUint256(htsMin))
            .addUint256(toUint256(hbarMin))
            .addAddress(toAddress)
            .addUint256(toUint256(deadline)),
        );
      } else {
        transaction.setFunction(
          "removeLiquidity",
          new ContractFunctionParameters()
            .addAddress(tokenIdToSolidityAddress(tokenA.tokenId))
            .addAddress(tokenIdToSolidityAddress(tokenB.tokenId))
            .addUint256(toUint256(lpAmount))
            .addUint256(toUint256(minAmountA))
            .addUint256(toUint256(minAmountB))
            .addAddress(toAddress)
            .addUint256(toUint256(deadline)),
        );
      }

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
