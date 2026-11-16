export interface PoolReserves {
  reserveIn: bigint;
  reserveOut: bigint;
}

/**
 * Price impact in percent of a quoted trade versus the spot price implied by the reserves of
 * every hop in the route. The result includes the 0.3% V1 LP fee per hop, so a tiny trade on a
 * single pool reports roughly 0.3. Returns null when any reserve is empty.
 */
export const spotPriceImpact = (
  amountIn: bigint,
  amountOut: bigint,
  hops: PoolReserves[],
): number | null => {
  if (amountIn <= 0n || amountOut <= 0n || hops.length === 0) {
    return null;
  }
  let spotOut = Number(amountIn);
  for (const { reserveIn, reserveOut } of hops) {
    if (reserveIn <= 0n || reserveOut <= 0n) {
      return null;
    }
    spotOut = (spotOut * Number(reserveOut)) / Number(reserveIn);
  }
  if (!Number.isFinite(spotOut) || spotOut <= 0) {
    return null;
  }
  const impact = (1 - Number(amountOut) / spotOut) * 100;
  return Math.round(impact * 1000) / 1000;
};

export const applySlippageToAmount = (amount: string, slippageTolerance: number): string => {
  const amountBig = BigInt(amount);
  const bps = Math.min(10_000, Math.max(0, Math.round(slippageTolerance * 100)));
  const numerator = BigInt(10_000 - bps);
  return ((amountBig * numerator) / 10_000n).toString();
};
