import type { ContractFunctionParameters } from "@hiero-ledger/sdk";

type SdkUint256 = Parameters<ContractFunctionParameters["addUint256"]>[0];

const MAX_UINT256 = (1n << 256n) - 1n;

/** Convert an exact unsigned ABI integer without narrowing it through a 64-bit Long. */
export const toUint256 = (value: string | number): SdkUint256 => {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(
      "Amount must be a non-negative safe integer; use a decimal string for large values.",
    );
  }
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw new Error("Amount must be a non-negative integer in decimal format.");
  }
  const integer = BigInt(text);
  if (integer > MAX_UINT256) {
    throw new Error("Amount exceeds the unsigned 256-bit range.");
  }
  // SDK 2.84.0 and 2.91.0 accept decimal strings in convertToBigNumber, but
  // their declaration omits strings. Keep this compatibility assertion at the
  // boundary, avoiding BigNumber class identity across copies and ESM/CJS.
  // Real ABI/transaction roundtrip tests must cover each supported SDK upgrade.
  return integer.toString() as unknown as SdkUint256;
};

export const parseUnits = (amount: string, decimals: number): string => {
  if (!amount || typeof amount !== "string") {
    throw new Error("Amount must be a non-empty string.");
  }
  if (decimals < 0) {
    throw new Error("Decimals must be non-negative.");
  }
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount format: ${amount}`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places.`);
  }
  const paddedFraction = fraction.padEnd(decimals, "0");
  const combined = `${whole}${paddedFraction}`;
  const normalized = combined.replace(/^0+/, "");
  return normalized === "" ? "0" : normalized;
};

export const formatUnits = (amount: string, decimals: number): string => {
  if (!amount || typeof amount !== "string") {
    throw new Error("Amount must be a non-empty string.");
  }
  if (decimals < 0) {
    throw new Error("Decimals must be non-negative.");
  }
  const trimmed = amount.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid integer amount: ${amount}`);
  }
  if (decimals === 0) {
    return trimmed.replace(/^0+(?=\d)/, "");
  }
  const padded = trimmed.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
};
