export interface SaucerSwapNetworkDefaults {
  routerContractId: string;
  routerV2ContractId: string;
  wrappedHbarTokenId: string;
  tokenAliases: Record<string, string>;
}

/** Official SaucerSwap contract addresses on Hedera Mainnet.
 * Source: https://docs.saucerswap.finance/developerx/contract-deployments */
export const SAUCERSWAP_MAINNET: SaucerSwapNetworkDefaults = {
  routerContractId: "0.0.3045981",
  routerV2ContractId: "0.0.3949434",
  wrappedHbarTokenId: "0.0.1456986",
  tokenAliases: {
    SAUCE: "0.0.731861",
    XSAUCE: "0.0.1460200",
  },
};

/** Official SaucerSwap contract addresses on Hedera Testnet.
 * Source: https://docs.saucerswap.finance/developerx/contract-deployments */
export const SAUCERSWAP_TESTNET: SaucerSwapNetworkDefaults = {
  routerContractId: "0.0.19264",
  routerV2ContractId: "0.0.1414040",
  wrappedHbarTokenId: "0.0.15058",
  tokenAliases: {
    SAUCE: "0.0.1183558",
    XSAUCE: "0.0.1418651",
  },
};

export const NETWORK_DEFAULTS: Record<string, SaucerSwapNetworkDefaults> = {
  mainnet: SAUCERSWAP_MAINNET,
  testnet: SAUCERSWAP_TESTNET,
};
