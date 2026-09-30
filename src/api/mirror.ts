import axios, { type AxiosInstance } from "axios";

export const MIRROR_NODE_URLS = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
} as const;

export interface MirrorNodeClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  http?: AxiosInstance;
}

type ContractCallResponse = { result?: string };
type TokenAllowancesResponse = { allowances?: Array<{ amount?: number | string }> };
type TokenInfoResponse = { decimals?: number | string };

const describeError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const messages = (error.response?.data as { _status?: { messages?: { message?: string }[] } })
      ?._status?.messages;
    const detail = messages?.map((m) => m.message).join(", ");
    return `HTTP ${error.response?.status ?? "network error"}${detail ? ` (${detail})` : ""}`;
  }
  return error instanceof Error ? error.message : "Unknown error";
};

/**
 * Thin client for the Hedera mirror node REST API. Used for read-only contract calls
 * (router quotes, pair reserves) and account lookups. Free and needs no API key.
 */
export class MirrorNodeClient {
  private readonly http: AxiosInstance;

  constructor(options: MirrorNodeClientOptions) {
    this.http =
      options.http ??
      axios.create({ baseURL: options.baseUrl, timeout: options.timeoutMs ?? 10_000 });
  }

  /** Execute a read-only EVM call against `to` and return the raw ABI-encoded result. */
  async contractCall(to: string, data: string): Promise<string> {
    try {
      const response = await this.http.post<ContractCallResponse>("/api/v1/contracts/call", {
        to,
        data,
        estimate: false,
        block: "latest",
      });
      const result = response.data?.result;
      if (!result) {
        throw new Error("empty result");
      }
      return result;
    } catch (error) {
      throw new Error(`Mirror node contract call to ${to} failed: ${describeError(error)}`);
    }
  }

  /** Remaining fungible token allowance granted by `ownerId` to `spenderId`, in smallest units. */
  async getTokenAllowance(ownerId: string, spenderId: string, tokenId: string): Promise<bigint> {
    const response = await this.http.get<TokenAllowancesResponse>(
      `/api/v1/accounts/${ownerId}/allowances/tokens`,
      { params: { "spender.id": spenderId, "token.id": tokenId } },
    );
    const amount = response.data?.allowances?.[0]?.amount;
    return amount === undefined ? 0n : BigInt(amount);
  }

  async getTokenDecimals(tokenId: string): Promise<number> {
    const response = await this.http.get<TokenInfoResponse>(`/api/v1/tokens/${tokenId}`);
    const decimals = Number(response.data?.decimals);
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error(`Mirror node returned no decimals for token ${tokenId}.`);
    }
    return decimals;
  }
}

export const createMirrorNodeClient = (options: MirrorNodeClientOptions): MirrorNodeClient =>
  new MirrorNodeClient(options);
