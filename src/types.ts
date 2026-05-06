export type PoolVersion = "v1" | "v2";

export interface ApiToken {
  decimals: number;
  icon: string | null;
  id: string;
  name: string;
  price: string;
  priceUsd: number;
  symbol: string;
  dueDiligenceComplete: boolean;
  isFeeOnTransferToken: boolean;
  description: string | null;
  website: string | null;
}

export interface ApiLiquidityPool {
  id: number;
  contractId: string;
  lpToken: {
    decimals: number;
    id: string;
    name: string;
    symbol: string;
    priceUsd: string;
  };
  lpTokenReserve: string;
  tokenA: ApiToken;
  tokenReserveA: string;
  tokenB: ApiToken;
  tokenReserveB: string;
}

export interface ApiSwapQuote {
  amountIn?: string;
  amountOut?: string;
  expectedOutput?: string;
  priceImpact?: number;
  route?: string[];
  data?: unknown;
}

export interface ApiFarm {
  id?: number;
  poolId?: number;
  rewardToken?: ApiToken;
  stakedToken?: ApiToken;
  apr?: number;
  tvlUsd?: number;
  data?: unknown;
}

export interface SwapQuote {
  amountIn: string;
  expectedOutput: string;
  priceImpact: number | null;
  route: string[];
  raw: unknown;
}

export interface SaucerSwapClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  apiKey?: string;
}

export interface SaucerSwapConfig {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  apiKey?: string;
  routerContractId?: string;
  routerV2ContractId?: string;
  wrappedHbarTokenId?: string;
  tokenAliases: Record<string, string>;
  defaultPoolVersion: PoolVersion;
  gasLimit: number;
  deadlineMinutes: number;
}
