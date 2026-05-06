import { describe, expect, it } from "vitest";
import { AddLiquidityTool, RemoveLiquidityTool } from "../src/tools/liquidity";

const TOKEN_A = "0.0.1234";
const TOKEN_B = "0.0.5678";
const ROUTER = "0.0.999";
const OPERATOR = "0.0.1001";

const fakeToken = (id: string) => ({ id, symbol: "TKN", name: "Token", decimals: 8 });

const fakePool = {
  tokenA: { id: TOKEN_A },
  tokenB: { id: TOKEN_B },
  tokenReserveA: "100000",
  tokenReserveB: "95000",
  lpToken: { decimals: 8 },
};

const defaultApi = {
  resolveTokenId: async (input: string) => input,
  getTokenByIdOrSymbol: async (id: string) => fakeToken(id),
  getPoolByTokens: async () => fakePool,
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

// ─── AddLiquidityTool ────────────────────────────────────────────────────────

describe("AddLiquidityTool.coreAction", () => {
  const tool = new AddLiquidityTool();
  const baseArgs = { tokenA: TOKEN_A, tokenB: TOKEN_B, amountA: "1", amountB: "1", slippageTolerance: 0.5 };

  it("returns error when client has no operator account", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(ROUTER) as never, makeClient() as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER, { getTokenByIdOrSymbol: async () => null }) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("token metadata") });
  });

  it("returns error when router contract ID is missing", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(undefined) as never, makeClient(OPERATOR) as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("router") });
  });

  it("returns a core payload with transaction and slippage-adjusted amounts on happy path", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(ROUTER) as never, makeClient(OPERATOR) as never);
    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("extras");
    if ("extras" in result) {
      expect(result.extras).toHaveProperty("amountADesired");
      expect(result.extras).toHaveProperty("amountBDesired");
      expect(result.extras).toHaveProperty("amountAMin");
      expect(result.extras).toHaveProperty("amountBMin");
      expect(BigInt(result.extras.amountAMin as string)).toBeLessThan(BigInt(result.extras.amountADesired as string));
    }
  });
});

describe("AddLiquidityTool.shouldSecondaryAction", () => {
  const tool = new AddLiquidityTool();

  it("returns true for a payload with a transaction", async () => {
    expect(await tool.shouldSecondaryAction({ transaction: {}, extras: {} }, {} as never)).toBe(true);
  });

  it("returns false for an error result", async () => {
    expect(await tool.shouldSecondaryAction({ success: false, error: "oops" }, {} as never)).toBe(false);
  });
});

// ─── RemoveLiquidityTool ─────────────────────────────────────────────────────

describe("RemoveLiquidityTool.coreAction", () => {
  const tool = new RemoveLiquidityTool();
  const baseArgs = {
    tokenA: TOKEN_A,
    tokenB: TOKEN_B,
    lpTokenAmount: "0.5",
    minAmountA: "0.4",
    minAmountB: "0.4",
  };

  it("returns error when client has no operator account", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(ROUTER) as never, makeClient() as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when pool cannot be found", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER, { getPoolByTokens: async () => null }) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("pool") });
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await tool.coreAction(
      baseArgs,
      makeContext(ROUTER, { getTokenByIdOrSymbol: async () => null }) as never,
      makeClient(OPERATOR) as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("token metadata") });
  });

  it("returns error when router contract ID is missing", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(undefined) as never, makeClient(OPERATOR) as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("router") });
  });

  it("returns a core payload with transaction and LP amounts on happy path", async () => {
    const result = await tool.coreAction(baseArgs, makeContext(ROUTER) as never, makeClient(OPERATOR) as never);
    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("extras");
    if ("extras" in result) {
      expect(result.extras).toHaveProperty("lpAmount");
      expect(result.extras).toHaveProperty("minAmountA");
      expect(result.extras).toHaveProperty("minAmountB");
    }
  });
});

describe("RemoveLiquidityTool.shouldSecondaryAction", () => {
  const tool = new RemoveLiquidityTool();

  it("returns true for a payload with a transaction", async () => {
    expect(await tool.shouldSecondaryAction({ transaction: {}, extras: {} }, {} as never)).toBe(true);
  });

  it("returns false for an error result", async () => {
    expect(await tool.shouldSecondaryAction({ success: false, error: "oops" }, {} as never)).toBe(false);
  });
});
