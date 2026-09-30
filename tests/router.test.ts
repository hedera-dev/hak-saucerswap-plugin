import { describe, expect, it } from "vitest";
import {
  decodeAddress,
  decodeUintArray,
  encodeGetAmountsOut,
  encodeGetPair,
} from "../src/utils/abi";
import { quoteExactInput } from "../src/utils/router";
import { createFakeMirror, evm } from "./helpers/mirror";

const WHBAR = "0.0.15058";
const SAUCE = "0.0.1183558";
const OTHER = "0.0.5000";
const ROUTER = "0.0.19264";

describe("abi", () => {
  it("encodes getAmountsOut like the router expects", () => {
    // Same bytes that returned 274.679694 SAUCE for 5 HBAR against the testnet router.
    expect(encodeGetAmountsOut(500_000_000n, [evm(WHBAR), evm(SAUCE)])).toBe(
      `0xd06ca61f${"1dcd6500".padStart(64, "0")}${"40".padStart(64, "0")}${"2".padStart(64, "0")}${"3ad2".padStart(64, "0")}${"120f46".padStart(64, "0")}`,
    );
  });

  it("encodes getPair", () => {
    expect(encodeGetPair(evm(WHBAR), evm(SAUCE))).toMatch(/^0xe6a43905[0-9a-f]{128}$/);
  });

  it("decodes a uint256[] result", () => {
    const result =
      "0x0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000002" +
      "000000000000000000000000000000000000000000000000000000001dcd6500" +
      "00000000000000000000000000000000000000000000000000000000105f478e";
    expect(decodeUintArray(result)).toEqual([500_000_000n, 274_679_694n]);
  });

  it("decodes an address result", () => {
    expect(
      decodeAddress("0x000000000000000000000000fe7cc3ceb7b1128bfc3889184e2d5561bf74bfb3"),
    ).toBe("0xfe7cc3ceb7b1128bfc3889184e2d5561bf74bfb3");
  });

  it("rejects malformed results", () => {
    expect(() => decodeUintArray("0x1234")).toThrow("Malformed");
  });
});

describe("quoteExactInput", () => {
  const pools = [
    { tokenA: WHBAR, tokenB: SAUCE, reserveA: 1_000_000_000_000n, reserveB: 550_000_000_000n },
    { tokenA: OTHER, tokenB: WHBAR, reserveA: 10_000_000n, reserveB: 1_000_000_000_000n },
  ];

  it("quotes the direct pair and reports price impact including the LP fee", async () => {
    const mirror = createFakeMirror(pools);
    const quote = await quoteExactInput({
      mirror,
      routerContractId: ROUTER,
      fromTokenId: WHBAR,
      toTokenId: SAUCE,
      amountIn: 500_000_000n,
      intermediateTokenId: WHBAR,
    });
    expect(quote.path).toEqual([WHBAR, SAUCE]);
    expect(quote.amountOut).toBeGreaterThan(270_000_000n);
    expect(quote.priceImpact).toBeGreaterThan(0.29);
    expect(quote.priceImpact).toBeLessThan(0.4);
  });

  it("routes through WHBAR when there is no direct pair", async () => {
    const mirror = createFakeMirror(pools);
    const quote = await quoteExactInput({
      mirror,
      routerContractId: ROUTER,
      fromTokenId: OTHER,
      toTokenId: SAUCE,
      amountIn: 1_000n,
      intermediateTokenId: WHBAR,
    });
    expect(quote.path).toEqual([OTHER, WHBAR, SAUCE]);
    expect(quote.amounts).toHaveLength(3);
    expect(quote.priceImpact).not.toBeNull();
  });

  it("throws when no route exists", async () => {
    const mirror = createFakeMirror(pools);
    await expect(
      quoteExactInput({
        mirror,
        routerContractId: ROUTER,
        fromTokenId: OTHER,
        toTokenId: "0.0.6000",
        amountIn: 1_000n,
      }),
    ).rejects.toThrow("No SaucerSwap V1 liquidity route");
  });

  it("returns a null price impact when reserves cannot be read", async () => {
    const mirror = createFakeMirror(pools);
    const flaky = {
      contractCall: (to: string, data: string) =>
        data.startsWith("0x0902f1ac")
          ? Promise.reject(new Error("down"))
          : mirror.contractCall(to, data),
    };
    const quote = await quoteExactInput({
      mirror: flaky,
      routerContractId: ROUTER,
      fromTokenId: WHBAR,
      toTokenId: SAUCE,
      amountIn: 500_000_000n,
    });
    expect(quote.amountOut).toBeGreaterThan(0n);
    expect(quote.priceImpact).toBeNull();
  });

  it("rejects identical tokens and zero amounts", async () => {
    const mirror = createFakeMirror(pools);
    const base = { mirror, routerContractId: ROUTER, fromTokenId: WHBAR };
    await expect(quoteExactInput({ ...base, toTokenId: WHBAR, amountIn: 1n })).rejects.toThrow(
      "same token",
    );
    await expect(quoteExactInput({ ...base, toTokenId: SAUCE, amountIn: 0n })).rejects.toThrow(
      "greater than zero",
    );
  });
});
