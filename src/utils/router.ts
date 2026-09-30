import type { MirrorNodeClient } from "../api/mirror";
import {
  SELECTORS,
  ZERO_ADDRESS,
  decodeAddress,
  decodeUintArray,
  decodeWords,
  encodeCall,
  encodeGetAmountsOut,
  encodeGetPair,
  toEvmAddress,
} from "./abi";
import { type PoolReserves, spotPriceImpact } from "./amm";
import { contractIdFromString, tokenIdToSolidityAddress } from "./tokens";

type MirrorCaller = Pick<MirrorNodeClient, "contractCall">;

export interface RouterQuote {
  /** Token IDs along the route, from input to output. */
  path: string[];
  /** `getAmountsOut` result, one entry per path element, in smallest units. */
  amounts: bigint[];
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number | null;
}

export const contractIdToEvmAddress = (contractId: string): string =>
  toEvmAddress(contractIdFromString(contractId).toSolidityAddress());

const tokenEvm = (tokenId: string): string => toEvmAddress(tokenIdToSolidityAddress(tokenId));

const candidatePaths = (from: string, to: string, intermediate?: string): string[][] => {
  const paths = [[from, to]];
  if (intermediate && intermediate !== from && intermediate !== to) {
    paths.push([from, intermediate, to]);
  }
  return paths;
};

const getAmountsOut = async (
  mirror: MirrorCaller,
  router: string,
  amountIn: bigint,
  path: string[],
): Promise<bigint[] | null> => {
  try {
    const result = await mirror.contractCall(
      router,
      encodeGetAmountsOut(amountIn, path.map(tokenEvm)),
    );
    const amounts = decodeUintArray(result);
    return amounts.length === path.length ? amounts : null;
  } catch {
    // The router reverts when a pair on the path does not exist.
    return null;
  }
};

/**
 * Read the reserves of every pair on `path`, oriented from input to output. Returns null if a
 * pair cannot be read, so the caller can report an unknown price impact.
 */
const readHopReserves = async (
  mirror: MirrorCaller,
  router: string,
  path: string[],
): Promise<PoolReserves[] | null> => {
  try {
    const factory = decodeAddress(await mirror.contractCall(router, encodeCall(SELECTORS.factory)));
    const hops: PoolReserves[] = [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const tokenIn = tokenEvm(path[i] as string);
      const tokenOut = tokenEvm(path[i + 1] as string);
      const pair = decodeAddress(
        await mirror.contractCall(factory, encodeGetPair(tokenIn, tokenOut)),
      );
      if (pair === ZERO_ADDRESS) {
        return null;
      }
      const [reserve0 = 0n, reserve1 = 0n] = decodeWords(
        await mirror.contractCall(pair, encodeCall(SELECTORS.getReserves)),
      );
      const token0 = decodeAddress(await mirror.contractCall(pair, encodeCall(SELECTORS.token0)));
      hops.push(
        token0 === tokenIn
          ? { reserveIn: reserve0, reserveOut: reserve1 }
          : { reserveIn: reserve1, reserveOut: reserve0 },
      );
    }
    return hops;
  } catch {
    return null;
  }
};

/**
 * Quote an exact-input swap on the SaucerSwap V1 router with `getAmountsOut`, executed as a
 * read-only call through the mirror node. Tries the direct pair and, when `intermediateTokenId`
 * is given (usually WHBAR), a two-hop route through it, and keeps the route with the best output.
 */
export const quoteExactInput = async (params: {
  mirror: MirrorCaller;
  routerContractId: string;
  fromTokenId: string;
  toTokenId: string;
  amountIn: bigint;
  intermediateTokenId?: string;
}): Promise<RouterQuote> => {
  const { mirror, fromTokenId, toTokenId, amountIn } = params;
  if (fromTokenId === toTokenId) {
    throw new Error("fromToken and toToken resolve to the same token.");
  }
  if (amountIn <= 0n) {
    throw new Error("Swap amount must be greater than zero.");
  }
  const router = contractIdToEvmAddress(params.routerContractId);

  let best: { path: string[]; amounts: bigint[] } | null = null;
  for (const path of candidatePaths(fromTokenId, toTokenId, params.intermediateTokenId)) {
    const amounts = await getAmountsOut(mirror, router, amountIn, path);
    const out = amounts?.[amounts.length - 1] ?? 0n;
    if (amounts && out > 0n && (!best || out > (best.amounts[best.amounts.length - 1] ?? 0n))) {
      best = { path, amounts };
    }
  }
  if (!best) {
    throw new Error(`No SaucerSwap V1 liquidity route found for ${fromTokenId} -> ${toTokenId}.`);
  }

  const amountOut = best.amounts[best.amounts.length - 1] as bigint;
  const hops = await readHopReserves(mirror, router, best.path);
  return {
    path: best.path,
    amounts: best.amounts,
    amountIn,
    amountOut,
    priceImpact: hops ? spotPriceImpact(amountIn, amountOut, hops) : null,
  };
};
