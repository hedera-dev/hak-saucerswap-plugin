import { describe, expect, it } from "vitest";
import { quoteTool } from "../src/tools/quote";
import { createFakeMirror } from "./helpers/mirror";

const WHBAR = "0.0.15058";
const SAUCE = "0.0.1183558";

const api = {
  resolveTokenId: async (input: string) => input,
  getTokenByIdOrSymbol: async (id: string) => ({ id, decimals: id === SAUCE ? 6 : 8 }),
};

const context = {
  saucerswapClient: api,
  saucerswapMirrorClient: createFakeMirror([
    { tokenA: WHBAR, tokenB: SAUCE, reserveA: 1_000_000_000_000n, reserveB: 550_000_000_000n },
  ]),
  config: { saucerswap: { routerContractId: "0.0.19264", wrappedHbarTokenId: WHBAR } },
};

describe("quote tool", () => {
  it("returns an on-chain quote in decimal units", async () => {
    const result = await quoteTool.execute(
      {} as never,
      context as never,
      {
        fromToken: "HBAR",
        toToken: SAUCE,
        amount: "5",
        slippageTolerance: 1,
      } as never,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.quote.amountIn).toBe("5");
      expect(Number(result.quote.expectedOutput)).toBeGreaterThan(270);
      expect(result.quote.route).toEqual(["HBAR", SAUCE]);
      expect(result.quote.priceImpact).toBeGreaterThan(0);
      expect(result.quote.raw.path).toEqual([WHBAR, SAUCE]);
      expect(result.quote.raw.amounts[0]).toBe("500000000");
      expect(Number(result.minOutput)).toBeCloseTo(Number(result.quote.expectedOutput) * 0.99, 4);
    }
  });

  it("returns an error result when the router has no route", async () => {
    const result = await quoteTool.execute(
      {} as never,
      context as never,
      {
        fromToken: SAUCE,
        toToken: "0.0.6000",
        amount: "1",
      } as never,
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("No SaucerSwap"),
    });
  });
});
