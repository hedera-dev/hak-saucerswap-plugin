import {
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Transaction,
  TransactionId,
} from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { toUint256 } from "../src/utils/units";

const MAX = (1n << 256n) - 1n;
describe("exact uint256 encoding", () => {
  it.each([0n, 1n, (1n << 64n) - 1n, 1n << 64n, MAX])(
    "roundtrips %s through real SDK transaction bytes",
    (value) => {
      const tx = new ContractExecuteTransaction()
        .setContractId("0.0.19264")
        .setGas(100000)
        .setFunction(
          "testUint256",
          new ContractFunctionParameters().addUint256(toUint256(value.toString())),
        )
        .setNodeAccountIds([AccountId.fromString("0.0.3")])
        .setTransactionId(TransactionId.generate("0.0.1001"))
        .freeze();
      const restored = Transaction.fromBytes(tx.toBytes()) as ContractExecuteTransaction;
      const hex = Buffer.from(restored.functionParameters ?? []).toString("hex");
      expect(hex.length).toBe(72);
      expect(BigInt(`0x${hex.slice(8)}`)).toBe(value);
    },
  );
  it.each([(MAX + 1n).toString(), (1n << 300n).toString()])("rejects overflow %s", (value) => {
    expect(() => toUint256(value)).toThrow("256-bit range");
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects imprecise number %s",
    (value) => {
      expect(() => toUint256(value)).toThrow("safe integer");
    },
  );
  it.each(["", "-1", "1.5", "1e3", "0xff"])("rejects malformed integer %s", (value) => {
    expect(() => toUint256(value)).toThrow("decimal format");
  });
});
