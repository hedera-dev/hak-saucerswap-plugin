import { describe, expect, it } from "vitest";
import { SwapTool } from "../src/tools/swap";

const TOKEN_A = "0.0.1234";
const TOKEN_B = "0.0.5678";
const ROUTER = "0.0.999";
const OPERATOR = "0.0.1001";

const fakeToken = (id: string) => ({ id, symbol: "TKN", name: "Token", decimals: 8 });

const defaultApi = {
  resolveTokenId: async (input: string) => input,
  getTokenByIdOrSymbol: async (id: string) => fakeToken(id),
  getSwapQuote: async () => ({ amountIn: "1", amountOut: "95" }),
  getPoolByTokens: async () => null,
};

const makeContext = (routerV2ContractId?: string, apiOverrides = {}) => ({
  saucerswapClient: { ...defaultApi, ...apiOverrides },
  config: {
    saucerswap: {
      routerV2ContractId,
      wrappedHbarTokenId: "0.0.15058",
      defaultPoolVersion: "v2",
    },
  },
});

const makeClient = (accountId?: string) => ({
  operatorAccountId: accountId ? { toString: () => accountId } : null,
});

const baseArgs = { fromToken: TOKEN_A, toToken: TOKEN_B, amount: "1", slippageTolerance: 0.5 };

describe("SwapTool.coreAction", () => {
  const tool = new SwapTool();

  it("returns error when client has no operator account", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER) as never,
      makeClient() as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER, { getTokenByIdOrSymbol: async () => null }) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("token metadata"),
    });
  });

  it("returns error when router contract ID is missing", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(undefined) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("router") });
  });

  it("returns a core payload with a ContractExecuteTransaction on happy path", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("extras");
    if ("extras" in result) {
      expect(result.extras).toHaveProperty("estimatedOutput", "95");
      expect(result.extras).toHaveProperty("minOutput");
      expect(result.extras).toHaveProperty("priceImpact");
      expect(result.extras).toHaveProperty("route");
    }
  });
});

describe("SwapTool.shouldSecondaryAction", () => {
  const tool = new SwapTool();

  it("returns true when coreAction produced a transaction payload", async () => {
    const payload = { transaction: {}, extras: {} };
    expect(await tool.shouldSecondaryAction(payload, {} as never)).toBe(true);
  });

  it("returns false for an error result", async () => {
    expect(await tool.shouldSecondaryAction({ success: false, error: "oops" }, {} as never)).toBe(
      false,
    );
  });

  it("returns false for null", async () => {
    expect(await tool.shouldSecondaryAction(null, {} as never)).toBe(false);
  });
});
