import type { PoolVersion, SaucerSwapConfig } from "./types";

const DEFAULT_CONFIG: SaucerSwapConfig = {
  baseUrl: "https://api.saucerswap.finance",
  timeoutMs: 10_000,
  retries: 2,
  routerContractId: undefined,
  routerV2ContractId: undefined,
  wrappedHbarTokenId: undefined,
  tokenAliases: {},
  defaultPoolVersion: "v2",
  gasLimit: 2_000_000,
  deadlineMinutes: 20,
};

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readTokenAliases = (value: string | undefined): Record<string, string> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {
    return {};
  }
  return {};
};

const readPoolVersion = (value: string | undefined): PoolVersion | undefined => {
  if (value === "v1" || value === "v2") {
    return value;
  }
  return undefined;
};

const readContextConfig = (context: unknown): Partial<SaucerSwapConfig> => {
  if (!context || typeof context !== "object") {
    return {};
  }
  const ctx = context as {
    config?: { saucerswap?: Partial<SaucerSwapConfig> };
    pluginConfig?: { saucerswap?: Partial<SaucerSwapConfig> };
  };
  return {
    ...(ctx.pluginConfig?.saucerswap ?? {}),
    ...(ctx.config?.saucerswap ?? {}),
  };
};

export const resolveSaucerSwapConfig = (context?: unknown): SaucerSwapConfig => {
  const ctxConfig = readContextConfig(context);
  const envAliases = readTokenAliases(process.env.SAUCERSWAP_TOKEN_ALIASES);
  const envDefaultVersion = readPoolVersion(process.env.SAUCERSWAP_DEFAULT_POOL_VERSION);

  return {
    ...DEFAULT_CONFIG,
    ...ctxConfig,
    baseUrl: ctxConfig.baseUrl ?? process.env.SAUCERSWAP_BASE_URL ?? DEFAULT_CONFIG.baseUrl,
    timeoutMs:
      ctxConfig.timeoutMs ?? toNumber(process.env.SAUCERSWAP_TIMEOUT_MS, DEFAULT_CONFIG.timeoutMs),
    retries: ctxConfig.retries ?? toNumber(process.env.SAUCERSWAP_RETRIES, DEFAULT_CONFIG.retries),
    apiKey: ctxConfig.apiKey ?? process.env.SAUCERSWAP_API_KEY,
    routerContractId: ctxConfig.routerContractId ?? process.env.SAUCERSWAP_ROUTER_CONTRACT_ID,
    routerV2ContractId:
      ctxConfig.routerV2ContractId ?? process.env.SAUCERSWAP_ROUTER_V2_CONTRACT_ID,
    wrappedHbarTokenId:
      ctxConfig.wrappedHbarTokenId ?? process.env.SAUCERSWAP_WRAPPED_HBAR_TOKEN_ID,
    tokenAliases: {
      ...envAliases,
      ...(ctxConfig.tokenAliases ?? {}),
    },
    defaultPoolVersion:
      ctxConfig.defaultPoolVersion ?? envDefaultVersion ?? DEFAULT_CONFIG.defaultPoolVersion,
    gasLimit:
      ctxConfig.gasLimit ?? toNumber(process.env.SAUCERSWAP_GAS_LIMIT, DEFAULT_CONFIG.gasLimit),
    deadlineMinutes:
      ctxConfig.deadlineMinutes ??
      toNumber(process.env.SAUCERSWAP_DEADLINE_MINUTES, DEFAULT_CONFIG.deadlineMinutes),
  };
};
