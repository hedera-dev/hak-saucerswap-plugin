import axios, { type AxiosError, type AxiosInstance } from "axios";
import type {
  ApiFarm,
  ApiLiquidityPool,
  ApiSwapQuote,
  ApiToken,
  PoolVersion,
  SaucerSwapClientOptions,
} from "../types";
import { SAUCER_ENDPOINTS } from "./endpoints";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: AxiosError): boolean => {
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
    return true;
  }
  const status = error.response?.status;
  if (!status) {
    return true;
  }
  return status === 429 || (status >= 500 && status < 600);
};

export class SaucerSwapClient {
  private readonly http: AxiosInstance;
  private readonly retries: number;
  private tokensCache: ApiToken[] | null = null;
  private tokenIndex: Map<string, ApiToken> | null = null;

  constructor(options: SaucerSwapClientOptions & { http?: AxiosInstance } = {}) {
    this.retries = options.retries ?? 2;
    this.http =
      options.http ??
      axios.create({
        baseURL: options.baseUrl ?? "https://api.saucerswap.finance",
        timeout: options.timeoutMs ?? 10_000,
        headers: options.apiKey ? { "x-api-key": options.apiKey } : undefined,
      });
  }

  private async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.http.get<T>(path, { params });
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        lastError = axiosError;
        if (attempt < this.retries && isRetryableError(axiosError)) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
        throw axiosError;
      }
    }
    throw lastError;
  }

  async getTokens(): Promise<ApiToken[]> {
    const tokens = await this.request<ApiToken[]>(SAUCER_ENDPOINTS.tokens);
    this.cacheTokens(tokens);
    return tokens;
  }

  async getTokenByIdOrSymbol(input: string): Promise<ApiToken | null> {
    if (!this.tokenIndex) {
      await this.getTokens();
    }
    return this.tokenIndex?.get(input.toLowerCase()) ?? null;
  }

  async resolveTokenId(input: string): Promise<string> {
    if (/^\d+\.\d+\.\d+$/.test(input)) {
      return input;
    }
    const token = await this.getTokenByIdOrSymbol(input);
    return token?.id ?? input;
  }

  async getPools(version: PoolVersion): Promise<ApiLiquidityPool[]> {
    const endpoint = version === "v1" ? SAUCER_ENDPOINTS.poolsV1 : SAUCER_ENDPOINTS.poolsV2;
    return this.request<ApiLiquidityPool[]>(endpoint);
  }

  async getPoolByTokens(
    tokenA: string,
    tokenB: string,
    version: PoolVersion,
  ): Promise<ApiLiquidityPool | null> {
    const pools = await this.getPools(version);
    const match = pools.find((pool) => {
      const direct = pool.tokenA.id === tokenA && pool.tokenB.id === tokenB;
      const inverse = pool.tokenA.id === tokenB && pool.tokenB.id === tokenA;
      return direct || inverse;
    });
    return match ?? null;
  }

  async getSwapQuote(params: {
    fromToken: string;
    toToken: string;
    amount: string;
  }): Promise<ApiSwapQuote> {
    const { fromToken, toToken, amount } = params;
    return this.request<ApiSwapQuote>(SAUCER_ENDPOINTS.swapQuote, {
      tokenIn: fromToken,
      tokenOut: toToken,
      amount,
      fromToken,
      toToken,
    });
  }

  async getFarms(): Promise<ApiFarm[]> {
    return this.request<ApiFarm[]>(SAUCER_ENDPOINTS.farms);
  }

  async getStats(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(SAUCER_ENDPOINTS.stats);
  }

  private cacheTokens(tokens: ApiToken[]) {
    this.tokensCache = tokens;
    this.tokenIndex = new Map();
    for (const token of tokens) {
      this.tokenIndex.set(token.id.toLowerCase(), token);
      this.tokenIndex.set(token.symbol.toLowerCase(), token);
      this.tokenIndex.set(token.name.toLowerCase(), token);
    }
  }
}

export const createSaucerSwapClient = (options: SaucerSwapClientOptions): SaucerSwapClient => {
  return new SaucerSwapClient(options);
};
