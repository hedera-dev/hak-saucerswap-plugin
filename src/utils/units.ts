import Long from "long";

/** Convert a base-unit string or number to a Long for ContractFunctionParameters.addUint256. */
export const toUint256 = (value: string | number): Long =>
  typeof value === "string" ? Long.fromString(value) : Long.fromNumber(value);

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
  const padded = trimmed.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
};
