import type { ContractExecuteTransaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { AddLiquidityTool, RemoveLiquidityTool } from "../src/tools/liquidity";
import { createFakeMirror } from "./helpers/mirror";

const WHBAR = "0.0.15058";
const TOKEN_A = "0.0.1234";
const TOKEN_B = "0.0.5678";
const LP_TOKEN = "0.0.9999";
const ROUTER = "0.0.19264";
const ROUTER_V2 = "0.0.1414040";
const OPERATOR = "0.0.1001";

const SELECTOR = {
  addLiquidity: "e8e33700",
  addLiquidityETH: "f305d719",
  removeLiquidity: "baa2abde",
  removeLiquidityETH: "02751cec",
};

const fakeToken = (id: string) => ({ id, symbol: "TKN", name: "Token", decimals: 8 });

const poolVersions: string[] = [];

const defaultApi = {
  resolveTokenId: async (input: string) => input,
  getTokenByIdOrSymbol: async (id: string) => fakeToken(id),
  getPoolByTokens: async (_a: string, _b: string, version: string) => {
    poolVersions.push(version);
    return { lpToken: { id: LP_TOKEN, decimals: 8 } };
  },
};

const makeContext = (
  options: {
    routerContractId?: string | null;
    apiOverrides?: Record<string, unknown>;
    allowance?: bigint;
    allowanceFor?: (tokenId: string) => bigint;
  } = {},
) => {
  const mirror = createFakeMirror([], { allowance: options.allowance ?? 10n ** 18n });
  if (options.allowanceFor) {
    const allowanceFor = options.allowanceFor;
    mirror.getTokenAllowance = async (_owner: string, _spender: string, tokenId: string) =>
      allowanceFor(tokenId);
  }
  return {
    saucerswapClient: { ...defaultApi, ...options.apiOverrides },
    saucerswapMirrorClient: mirror,
    config: {
      saucerswap: {
        routerContractId: options.routerContractId === null ? undefined : ROUTER,
        routerV2ContractId: ROUTER_V2,
        wrappedHbarTokenId: WHBAR,
        defaultPoolVersion: "v2",
      },
    },
  };
};

const makeClient = (accountId?: string) => ({
  operatorAccountId: accountId ? { toString: () => accountId } : null,
});

const txOf = (result: unknown) =>
  (result as unknown as { transaction: ContractExecuteTransaction }).transaction;

const selectorOf = (result: unknown) =>
  Buffer.from(txOf(result).functionParameters ?? [])
    .toString("hex")
    .slice(0, 8);

// ─── AddLiquidityTool ────────────────────────────────────────────────────────

describe("AddLiquidityTool.coreAction", () => {
  const tool = new AddLiquidityTool();
  const baseArgs = {
    tokenA: TOKEN_A,
    tokenB: TOKEN_B,
    amountA: "1",
    amountB: "2",
    slippageTolerance: 0.5,
  };
  const run = (args: Record<string, unknown>, context = makeContext()) =>
    tool.coreAction(
      { ...baseArgs, ...args } as never,
      context as never,
      makeClient(OPERATOR) as never,
    );

  it("returns error when client has no operator account", async () => {
    const result = await tool.coreAction(baseArgs, makeContext() as never, makeClient() as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await run(
      {},
      makeContext({ apiOverrides: { getTokenByIdOrSymbol: async () => null } }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("token metadata"),
    });
  });

  it("returns error when the V1 router is missing, even if V2 is set", async () => {
    const result = await run({}, makeContext({ routerContractId: null }));
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("V1 router") });
  });

  it("uses addLiquidity on the V1 router for two HTS tokens", async () => {
    const result = await run({});
    expect(selectorOf(result)).toBe(SELECTOR.addLiquidity);
    expect(txOf(result).contractId?.toString()).toBe(ROUTER);
    expect(txOf(result).payableAmount).toBeNull();
    if ("extras" in result) {
      expect(result.extras).toEqual({
        amountADesired: "100000000",
        amountBDesired: "200000000",
        amountAMin: "99500000",
        amountBMin: "199000000",
      });
    }
  });

  it("uses addLiquidityETH with the HBAR amount as payable when one side is HBAR", async () => {
    for (const args of [
      { tokenA: "HBAR", amountA: "3", tokenB: TOKEN_B, amountB: "2" },
      { tokenA: TOKEN_B, amountA: "2", tokenB: "hbar", amountB: "3" },
    ]) {
      const result = await run(args);
      expect(selectorOf(result)).toBe(SELECTOR.addLiquidityETH);
      expect(txOf(result).payableAmount?.toTinybars().toString()).toBe("300000000");
    }
  });

  it("stops with approval instructions for every HTS token missing an allowance", async () => {
    const result = await run({}, makeContext({ allowance: 0n }));
    expect(result).toMatchObject({ success: false });
    const { error } = result as { error: string };
    expect(error).toContain(`at least 1 ${TOKEN_A}`);
    expect(error).toContain(`at least 2 ${TOKEN_B}`);
    expect(error).toContain("approve_token_allowance_tool");
  });

  it("does not require an allowance for the HBAR side", async () => {
    const result = await run(
      { tokenA: "HBAR" },
      makeContext({ allowanceFor: (id) => (id === TOKEN_B ? 10n ** 18n : 0n) }),
    );
    expect(result).toHaveProperty("transaction");
  });

  it("rejects the same token on both sides", async () => {
    const result = await run({ tokenB: TOKEN_A });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("same token") });
  });
});

describe("AddLiquidityTool.shouldSecondaryAction", () => {
  const tool = new AddLiquidityTool();

  it("returns true for a payload with a transaction", async () => {
    expect(await tool.shouldSecondaryAction({ transaction: {}, extras: {} }, {} as never)).toBe(
      true,
    );
  });

  it("returns false for an error result", async () => {
    expect(await tool.shouldSecondaryAction({ success: false, error: "oops" }, {} as never)).toBe(
      false,
    );
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
  const run = (args: Record<string, unknown>, context = makeContext()) =>
    tool.coreAction(
      { ...baseArgs, ...args } as never,
      context as never,
      makeClient(OPERATOR) as never,
    );

  it("returns error when client has no operator account", async () => {
    const result = await tool.coreAction(baseArgs, makeContext() as never, makeClient() as never);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when pool cannot be found", async () => {
    const result = await run(
      {},
      makeContext({ apiOverrides: { getPoolByTokens: async () => null } }),
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("V1 pool") });
  });

  it("looks up the V1 pool even when defaultPoolVersion is v2", async () => {
    poolVersions.length = 0;
    await run({});
    expect(poolVersions).toEqual(["v1"]);
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await run(
      {},
      makeContext({ apiOverrides: { getTokenByIdOrSymbol: async () => null } }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("token metadata"),
    });
  });

  it("returns error when the V1 router is missing", async () => {
    const result = await run({}, makeContext({ routerContractId: null }));
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("V1 router") });
  });

  it("uses removeLiquidity on the V1 router for two HTS tokens", async () => {
    const result = await run({});
    expect(selectorOf(result)).toBe(SELECTOR.removeLiquidity);
    expect(txOf(result).contractId?.toString()).toBe(ROUTER);
    if ("extras" in result) {
      expect(result.extras).toEqual({
        lpAmount: "50000000",
        minAmountA: "40000000",
        minAmountB: "40000000",
      });
    }
  });

  it("uses removeLiquidityETH when one side is HBAR", async () => {
    const result = await run({ tokenB: "HBAR" });
    expect(selectorOf(result)).toBe(SELECTOR.removeLiquidityETH);
    expect(txOf(result).payableAmount).toBeNull();
  });

  it("stops with approval instructions when the LP token allowance is too low", async () => {
    const result = await run(
      {},
      makeContext({ allowanceFor: (id) => (id === LP_TOKEN ? 1n : 10n ** 18n) }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(`at least 0.5 ${LP_TOKEN} (current allowance: 0.00000001)`),
    });
  });
});

describe("RemoveLiquidityTool.shouldSecondaryAction", () => {
  const tool = new RemoveLiquidityTool();

  it("returns true for a payload with a transaction", async () => {
    expect(await tool.shouldSecondaryAction({ transaction: {}, extras: {} }, {} as never)).toBe(
      true,
    );
  });

  it("returns false for an error result", async () => {
    expect(await tool.shouldSecondaryAction({ success: false, error: "oops" }, {} as never)).toBe(
      false,
    );
  });
});
