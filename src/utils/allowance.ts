import type { MirrorNodeClient } from "../api/mirror";
import { formatUnits } from "./units";

export interface AllowanceRequirement {
  tokenId: string;
  /** Required allowance in smallest units. */
  amount: bigint;
  decimals: number;
}

/**
 * The V1 router pulls HTS tokens from the operator with transferFrom, so the operator must have
 * granted the router an allowance first. Returns an error message listing every missing
 * allowance, or null when all are sufficient. If the mirror node cannot answer for a token,
 * that token is skipped and the network decides.
 */
export const findMissingAllowances = async (
  mirror: Pick<MirrorNodeClient, "getTokenAllowance">,
  ownerId: string,
  routerContractId: string,
  requirements: AllowanceRequirement[],
): Promise<string | null> => {
  const missing: string[] = [];
  for (const { tokenId, amount, decimals } of requirements) {
    const current = await mirror
      .getTokenAllowance(ownerId, routerContractId, tokenId)
      .catch(() => null);
    if (current !== null && current < amount) {
      missing.push(
        `at least ${formatUnits(amount.toString(), decimals)} ${tokenId} (current allowance: ${formatUnits(current.toString(), decimals)})`,
      );
    }
  }
  if (missing.length === 0) {
    return null;
  }
  return `The SaucerSwap router ${routerContractId} needs a token allowance from ${ownerId} of ${missing.join("; ")}. Approve it first, for example with the Hedera Agent Kit approve_token_allowance_tool using spender ${routerContractId}, then retry.`;
};
