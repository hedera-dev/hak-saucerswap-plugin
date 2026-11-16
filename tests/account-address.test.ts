import { describe, expect, it, vi } from "vitest";
import { MirrorNodeClient } from "../src/api/mirror";
const ID = "0.0.1001";
const ALIAS = "0x111122223333444455556666777788889999aaaa";
const make = (data: unknown) => {
  const get = vi.fn().mockResolvedValue({ data });
  return {
    get,
    mirror: new MirrorNodeClient({ baseUrl: "https://example.invalid", http: { get } as never }),
  };
};
describe("canonical account address", () => {
  it("returns an ECDSA alias instead of deriving a numeric address", async () => {
    const { mirror, get } = make({ account: ID, deleted: false, evm_address: ALIAS });
    expect(await mirror.getAccountEvmAddress(ID)).toBe(ALIAS.slice(2));
    expect(get).toHaveBeenCalledWith(`/api/v1/accounts/${ID}`);
  });
  it("accepts a canonical long-zero address for an account without an EVM alias", async () => {
    const address = `0x${"3e9".padStart(40, "0")}`;
    expect(
      await make({ account: ID, deleted: false, evm_address: address }).mirror.getAccountEvmAddress(
        ID,
      ),
    ).toBe(address.slice(2));
  });
  it.each([
    { account: ID, deleted: false },
    { account: ID, deleted: false, evm_address: "bad" },
    { account: ID, deleted: false, evm_address: `0x${"0".repeat(40)}` },
    { account: ID, deleted: true, evm_address: ALIAS },
    { account: "0.0.9999", deleted: false, evm_address: ALIAS },
  ])("fails closed for unavailable or mismatched canonical metadata", async (data) => {
    await expect(make(data).mirror.getAccountEvmAddress(ID)).rejects.toThrow(
      "canonical EVM address",
    );
  });
});
