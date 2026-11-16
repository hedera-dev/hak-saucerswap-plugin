import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSaucerSwapConfig } from "../src/config";
const original = {
  baseUrl: process.env.SAUCERSWAP_BASE_URL,
  network: process.env.SAUCERSWAP_NETWORK,
};
afterEach(() => {
  vi.unstubAllEnvs();
  if (original.baseUrl === undefined) Reflect.deleteProperty(process.env, "SAUCERSWAP_BASE_URL");
  else process.env.SAUCERSWAP_BASE_URL = original.baseUrl;
  if (original.network === undefined) Reflect.deleteProperty(process.env, "SAUCERSWAP_NETWORK");
  else process.env.SAUCERSWAP_NETWORK = original.network;
});
describe("network-specific API defaults", () => {
  const clean = () => {
    Reflect.deleteProperty(process.env, "SAUCERSWAP_BASE_URL");
    Reflect.deleteProperty(process.env, "SAUCERSWAP_NETWORK");
  };
  it("uses the testnet API when testnet is explicitly configured", () => {
    clean();
    expect(
      resolveSaucerSwapConfig({ config: { saucerswap: { network: "testnet" } } }).baseUrl,
    ).toBe("https://test-api.saucerswap.finance");
  });
  it("uses the testnet API when selected through environment", () => {
    clean();
    vi.stubEnv("SAUCERSWAP_NETWORK", "testnet");
    expect(resolveSaucerSwapConfig().baseUrl).toBe("https://test-api.saucerswap.finance");
  });
  it.each([undefined, "mainnet"])("preserves the existing mainnet default for %s", (network) => {
    clean();
    expect(resolveSaucerSwapConfig({ config: { saucerswap: { network } } }).baseUrl).toBe(
      "https://api.saucerswap.finance",
    );
  });
  it("gives context network precedence over environment network", () => {
    clean();
    vi.stubEnv("SAUCERSWAP_NETWORK", "testnet");
    expect(
      resolveSaucerSwapConfig({ config: { saucerswap: { network: "mainnet" } } }).baseUrl,
    ).toBe("https://api.saucerswap.finance");
  });
  it("preserves explicit API overrides and context precedence", () => {
    clean();
    vi.stubEnv("SAUCERSWAP_BASE_URL", "https://custom-env.invalid");
    vi.stubEnv("SAUCERSWAP_NETWORK", "testnet");
    expect(resolveSaucerSwapConfig().baseUrl).toBe("https://custom-env.invalid");
    expect(
      resolveSaucerSwapConfig({
        config: { saucerswap: { baseUrl: "https://custom-context.invalid" } },
      }).baseUrl,
    ).toBe("https://custom-context.invalid");
  });
});
