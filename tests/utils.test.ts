import { describe, expect, it } from "vitest";
import { applySlippageToAmount, spotPriceImpact } from "../src/utils/amm";
import { formatUnits, parseUnits, toUint256 } from "../src/utils/units";

describe("units", () => {
  it("parses decimal amounts to smallest units", () => {
    expect(parseUnits("1.23", 2)).toBe("123");
    expect(parseUnits("0.0001", 6)).toBe("100");
  });

  it("formats smallest units to decimals", () => {
    expect(formatUnits("12345", 2)).toBe("123.45");
    expect(formatUnits("100", 6)).toBe("0.0001");
  });

  it("formats tokens with zero decimals", () => {
    expect(formatUnits("42", 0)).toBe("42");
  });

  it("converts large amounts to an unsigned uint256 Long", () => {
    expect(toUint256("18446744073709551615").toString()).toBe("18446744073709551615");
  });
});

describe("amm", () => {
  it("applies slippage tolerance", () => {
    expect(applySlippageToAmount("10000", 0.5)).toBe("9950");
  });

  it("clamps slippage above 100%", () => {
    expect(applySlippageToAmount("10000", 150)).toBe("0");
  });

  it("measures price impact against the spot price", () => {
    // Spot price 2 out per 1 in; receiving 190 for 100 in is a 5% impact.
    expect(spotPriceImpact(100n, 190n, [{ reserveIn: 1_000n, reserveOut: 2_000n }])).toBe(5);
  });

  it("compounds the spot price across hops", () => {
    const hops = [
      { reserveIn: 1_000n, reserveOut: 2_000n },
      { reserveIn: 1_000n, reserveOut: 500n },
    ];
    expect(spotPriceImpact(100n, 99n, hops)).toBe(1);
  });

  it("returns null for empty reserves", () => {
    expect(spotPriceImpact(100n, 99n, [{ reserveIn: 0n, reserveOut: 1n }])).toBeNull();
  });
});
