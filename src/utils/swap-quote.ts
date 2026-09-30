import type { Client } from "@hiero-ledger/sdk";
import { type SaucerSwapClient, createSaucerSwapClient } from "../api/client";
import { MIRROR_NODE_URLS, type MirrorNodeClient, createMirrorNodeClient } from "../api/mirror";
import type { SaucerSwapConfig } from "../types";
import { type RouterQuote, quoteExactInput } from "./router";
import { normalizeTokenAlias, requireTokenId } from "./tokens";
import { formatUnits, parseUnits } from "./units";

export const HBAR_DECIMALS = 8;

export type TokenLookup = Pick<SaucerSwapClient, "resolveTokenId" | "getTokenByIdOrSymbol">;
export type MirrorLookup = Pick<
  MirrorNodeClient,
  "contractCall" | "getTokenDecimals" | "getTokenAllowance"
>;

export interface ResolvedSwapToken {
  /** HTS token ID. For native HBAR this is the configured WHBAR token, used in the router path. */
  tokenId: string;
  isHbar: boolean;
  decimals: number;
  /** Route label: "HBAR" for native HBAR, the token ID otherwise. */
  label: string;
}

export interface PreparedSwapQuote {
  from: ResolvedSwapToken;
  to: ResolvedSwapToken;
  routerContractId: string;
  quote: RouterQuote;
  /** Quoted output in decimal units of the output token. */
  expectedOutput: string;
  route: string[];
}

/** `HBAR` (any case) means native HBAR, which the router handles through its ETH functions. */
export const isNativeHbar = (token: string): boolean => token.trim().toUpperCase() === "HBAR";

type ToolContext = {
  saucerswapClient?: TokenLookup;
  saucerswapMirrorClient?: MirrorLookup;
};

const ledgerNetwork = (client?: Client): keyof typeof MIRROR_NODE_URLS | undefined => {
  const name = client?.ledgerId?.toString();
  return name === "mainnet" || name === "testnet" || name === "previewnet" ? name : undefined;
};

/** Mirror node URL: explicit config, then the configured network, then the client's ledger. */
export const resolveMirrorNodeUrl = (config: SaucerSwapConfig, client?: Client): string =>
  config.mirrorNodeUrl ?? MIRROR_NODE_URLS[config.network ?? ledgerNetwork(client) ?? "mainnet"];

export const resolveApiClients = (
  context: unknown,
  config: SaucerSwapConfig,
  client?: Client,
): { api: TokenLookup; mirror: MirrorLookup } => {
  const ctx = (context ?? {}) as ToolContext;
  return {
    api: ctx.saucerswapClient ?? createSaucerSwapClient(config),
    mirror:
      ctx.saucerswapMirrorClient ??
      createMirrorNodeClient({
        baseUrl: resolveMirrorNodeUrl(config, client),
        timeoutMs: config.timeoutMs,
      }),
  };
};

const resolveToken = async (
  input: string,
  config: SaucerSwapConfig,
  api: TokenLookup,
  mirror: MirrorLookup,
): Promise<ResolvedSwapToken> => {
  if (isNativeHbar(input)) {
    if (!config.wrappedHbarTokenId) {
      throw new Error(
        "Missing wrappedHbarTokenId configuration, required to swap HBAR. Set `network` or SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID.",
      );
    }
    return {
      tokenId: config.wrappedHbarTokenId,
      isHbar: true,
      decimals: HBAR_DECIMALS,
      label: "HBAR",
    };
  }

  const tokenId = requireTokenId(await api.resolveTokenId(normalizeTokenAlias(input, config)));
  const meta = await api.getTokenByIdOrSymbol(tokenId).catch(() => null);
  const decimals = meta?.decimals ?? (await mirror.getTokenDecimals(tokenId).catch(() => null));
  if (decimals === null || decimals === undefined) {
    throw new Error(`Unable to resolve token metadata for ${input}.`);
  }
  return { tokenId, isHbar: false, decimals, label: tokenId };
};

/**
 * Resolve both tokens and quote the swap on-chain through the SaucerSwap V1 router.
 * Shared by the quote tool and the swap tool so both report the same numbers.
 */
export const prepareSwapQuote = async (params: {
  fromToken: string;
  toToken: string;
  amount: string;
  config: SaucerSwapConfig;
  api: TokenLookup;
  mirror: MirrorLookup;
}): Promise<PreparedSwapQuote> => {
  const { config, api, mirror } = params;
  const routerContractId = config.routerContractId;
  if (!routerContractId) {
    throw new Error(
      "Missing SaucerSwap V1 router contract ID (routerContractId). Swaps and quotes use the V1 router; set `network` or SAUCERSWAP_ROUTER_CONTRACT_ID.",
    );
  }

  const from = await resolveToken(params.fromToken, config, api, mirror);
  const to = await resolveToken(params.toToken, config, api, mirror);
  if (from.isHbar && to.isHbar) {
    throw new Error("fromToken and toToken are both HBAR.");
  }

  const quote = await quoteExactInput({
    mirror,
    routerContractId,
    fromTokenId: from.tokenId,
    toTokenId: to.tokenId,
    amountIn: BigInt(parseUnits(params.amount, from.decimals)),
    intermediateTokenId: config.wrappedHbarTokenId,
  });

  const route = quote.path.map((tokenId, index) => {
    if (index === 0) return from.label;
    if (index === quote.path.length - 1) return to.label;
    return tokenId;
  });

  return {
    from,
    to,
    routerContractId,
    quote,
    expectedOutput: formatUnits(quote.amountOut.toString(), to.decimals),
    route,
  };
};
