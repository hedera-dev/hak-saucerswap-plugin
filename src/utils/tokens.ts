import { AccountId, ContractId, TokenId } from "@hiero-ledger/sdk";
import type { SaucerSwapConfig } from "../types";

export const normalizeTokenAlias = (token: string, config: SaucerSwapConfig): string => {
  const tokenLower = token.toLowerCase();
  for (const [alias, value] of Object.entries(config.tokenAliases)) {
    if (alias.toLowerCase() === tokenLower) {
      return value;
    }
  }
  if (tokenLower === "hbar" && config.wrappedHbarTokenId) {
    return config.wrappedHbarTokenId;
  }
  return token;
};

export const requireTokenId = (token: string): string => {
  if (!/^\d+\.\d+\.\d+$/.test(token)) {
    throw new Error(`Token ID required for on-chain actions: ${token}`);
  }
  return token;
};

export const tokenIdToSolidityAddress = (tokenId: string): string => {
  return TokenId.fromString(tokenId).toSolidityAddress();
};

export const accountIdToSolidityAddress = (accountId: string): string => {
  return AccountId.fromString(accountId).toSolidityAddress();
};

export const contractIdFromString = (contractId: string): ContractId => {
  return ContractId.fromString(contractId);
};
