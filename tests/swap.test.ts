import type { ContractExecuteTransaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { SwapTool } from "../src/tools/swap";
import { createFakeMirror } from "./helpers/mirror";

const WHBAR = "0.0.15058";
const SAUCE = "0.0.1183558";
const USDC = "0.0.5000";
const ROUTER = "0.0.19264";
const OPERATOR = "0.0.1001";

const SELECTOR = {
  swapExactETHForTokens: "7ff36ab5",
  swapExactTokensForETH: "18cbafe5",
  swapExactTokensForTokens: "38ed1739",
};

const DECIMALS: Record<string, number> = { [WHBAR]: 8, [SAUCE]: 6, [USDC]: 6 };

const pools = [
  { tokenA: WHBAR, tokenB: SAUCE, reserveA: 1_000_000_000_000n, reserveB: 550_000_000_000n },
  { tokenA: SAUCE, tokenB: USDC, reserveA: 1_000_000_000_000n, reserveB: 100_000_000_000n },
];

const defaultApi = {
  resolveTokenId: async (input: string) => (input.toUpperCase() === "SAUCE" ? SAUCE : input),
  getTokenByIdOrSymbol: async (id: string) =>
    DECIMALS[id] === undefined ? null : { id, decimals: DECIMALS[id] },
};

const makeContext = (
  options: {
    routerContractId?: string | null;
    apiOverrides?: Record<string, unknown>;
    mirror?: ReturnType<typeof createFakeMirror>;
  } = {},
) => ({
  saucerswapClient: { ...defaultApi, ...options.apiOverrides },
  saucerswapMirrorClient: options.mirror ?? createFakeMirror(pools, { allowance: 10n ** 18n }),
  config: {
    saucerswap: {
      routerContractId: options.routerContractId === null ? undefined : ROUTER,
      routerV2ContractId: "0.0.1414040",
      wrappedHbarTokenId: WHBAR,
      defaultPoolVersion: "v2",
    },
  },
});

const makeClient = (accountId?: string) => ({
  operatorAccountId: accountId ? { toString: () => accountId } : null,
});

const run = (args: Record<string, unknown>, context = makeContext()) =>
  new SwapTool().coreAction(
    { slippageTolerance: 0.5, ...args } as never,
    context as never,
    makeClient(OPERATOR) as never,
  );

const selectorOf = (result: unknown) => {
  const tx = (result as unknown as { transaction: ContractExecuteTransaction }).transaction;
  return Buffer.from(tx.functionParameters ?? [])
    .toString("hex")
    .slice(0, 8);
};

describe("SwapTool.coreAction", () => {
  it("returns error when client has no operator account", async () => {
    const result = await new SwapTool().coreAction(
      { fromToken: "HBAR", toToken: SAUCE, amount: "1", slippageTolerance: 0.5 },
      makeContext() as never,
      makeClient() as never,
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("operator") });
  });

  it("returns error when token metadata cannot be resolved", async () => {
    const result = await run(
      { fromToken: "0.0.7777", toToken: SAUCE, amount: "1" },
      makeContext({ apiOverrides: { getTokenByIdOrSymbol: async () => null } }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("token metadata"),
    });
  });

  it("falls back to mirror node decimals when the SaucerSwap API has no metadata", async () => {
    const result = await run(
      { fromToken: "HBAR", toToken: SAUCE, amount: "1" },
      makeContext({
        apiOverrides: { getTokenByIdOrSymbol: async () => null },
        mirror: createFakeMirror(pools, { decimals: DECIMALS }),
      }),
    );
    expect(result).toHaveProperty("transaction");
  });

  it("returns error when the V1 router contract ID is missing, even if V2 is set", async () => {
    const result = await run(
      { fromToken: "HBAR", toToken: SAUCE, amount: "1" },
      makeContext({ routerContractId: null }),
    );
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("V1 router") });
  });

  it("swaps HBAR in with swapExactETHForTokens and a payable amount", async () => {
    const result = await run({ fromToken: "hbar", toToken: "SAUCE", amount: "5" });
    expect(selectorOf(result)).toBe(SELECTOR.swapExactETHForTokens);
    const tx = (result as unknown as { transaction: ContractExecuteTransaction }).transaction;
    expect(tx.payableAmount?.toTinybars().toString()).toBe("500000000");
    expect(tx.contractId?.toString()).toBe(ROUTER);
  });

  it("swaps to HBAR with swapExactTokensForETH and no payable amount", async () => {
    const result = await run({ fromToken: SAUCE, toToken: "HBAR", amount: "10" });
    expect(selectorOf(result)).toBe(SELECTOR.swapExactTokensForETH);
    const tx = (result as unknown as { transaction: ContractExecuteTransaction }).transaction;
    expect(tx.payableAmount).toBeNull();
    expect((result as { extras: { route: string[] } }).extras.route).toEqual([SAUCE, "HBAR"]);
  });

  it("swaps HTS to HTS with swapExactTokensForTokens", async () => {
    const result = await run({ fromToken: SAUCE, toToken: USDC, amount: "10" });
    expect(selectorOf(result)).toBe(SELECTOR.swapExactTokensForTokens);
  });

  it("keeps the { transaction, extras } payload shape with decimal amounts", async () => {
    const result = await run({ fromToken: "HBAR", toToken: SAUCE, amount: "5" });
    expect(Object.keys(result).sort()).toEqual(["extras", "transaction"]);
    const { extras } = result as {
      extras: { estimatedOutput: string; minOutput: string; priceImpact: number; route: string[] };
    };
    expect(Object.keys(extras).sort()).toEqual([
      "estimatedOutput",
      "minOutput",
      "priceImpact",
      "route",
    ]);
    expect(Number(extras.estimatedOutput)).toBeGreaterThan(270);
    expect(Number(extras.minOutput)).toBeCloseTo(Number(extras.estimatedOutput) * 0.995, 4);
    expect(extras.priceImpact).toBeGreaterThan(0);
    expect(extras.route).toEqual(["HBAR", SAUCE]);
  });

  it("stops with approval instructions when the router allowance is too low", async () => {
    const result = await run(
      { fromToken: SAUCE, toToken: "HBAR", amount: "10" },
      makeContext({ mirror: createFakeMirror(pools, { allowance: 1_000_000n }) }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(
        /allowance of at least 10 0\.0\.1183558.*current allowance: 1\b/,
      ),
    });
    expect((result as { error: string }).error).toContain("approve_token_allowance_tool");
  });

  it("does not check the allowance for HBAR input", async () => {
    const result = await run(
      { fromToken: "HBAR", toToken: SAUCE, amount: "1" },
      makeContext({ mirror: createFakeMirror(pools, { allowance: 0n }) }),
    );
    expect(result).toHaveProperty("transaction");
  });

  it("rejects HBAR on both sides", async () => {
    const result = await run({ fromToken: "HBAR", toToken: "HBAR", amount: "1" });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("both HBAR") });
  });

  it("returns error when no pool exists for the pair", async () => {
    const result = await run(
      { fromToken: "HBAR", toToken: "0.0.6000", amount: "1" },
      makeContext({
        apiOverrides: { getTokenByIdOrSymbol: async (id: string) => ({ id, decimals: 8 }) },
      }),
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("No SaucerSwap"),
    });
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
