/**
 * Minimal ABI encoding and decoding for the read-only SaucerSwap V1 calls the plugin makes
 * through the mirror node. Only static words, address arrays and uint arrays are needed.
 */

export const SELECTORS = {
  /** getAmountsOut(uint256,address[]) on the V1 router */
  getAmountsOut: "d06ca61f",
  /** factory() on the V1 router */
  factory: "c45a0155",
  /** getPair(address,address) on the V1 factory */
  getPair: "e6a43905",
  /** getReserves() on a V1 pair */
  getReserves: "0902f1ac",
  /** token0() on a V1 pair */
  token0: "0dfe1681",
} as const;

export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

const strip0x = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex);

const encodeWord = (value: bigint): string => {
  if (value < 0n) {
    throw new Error("Cannot ABI-encode a negative integer.");
  }
  return value.toString(16).padStart(64, "0");
};

const encodeAddressWord = (address: string): string => {
  const raw = strip0x(address).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(raw)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }
  return raw.padStart(64, "0");
};

/** Normalize an address to lower-case `0x`-prefixed form. */
export const toEvmAddress = (address: string): string => `0x${strip0x(address).toLowerCase()}`;

export const encodeCall = (selector: string, ...words: string[]): string =>
  `0x${selector}${words.join("")}`;

export const encodeGetAmountsOut = (amountIn: bigint, path: string[]): string =>
  encodeCall(
    SELECTORS.getAmountsOut,
    encodeWord(amountIn),
    encodeWord(64n),
    encodeWord(BigInt(path.length)),
    ...path.map(encodeAddressWord),
  );

export const encodeGetPair = (tokenA: string, tokenB: string): string =>
  encodeCall(SELECTORS.getPair, encodeAddressWord(tokenA), encodeAddressWord(tokenB));

/** Split an ABI result into 32-byte words, each as a bigint. */
export const decodeWords = (hex: string): bigint[] => {
  const raw = strip0x(hex);
  if (raw.length === 0 || raw.length % 64 !== 0) {
    throw new Error("Malformed ABI result.");
  }
  const words: bigint[] = [];
  for (let i = 0; i < raw.length; i += 64) {
    words.push(BigInt(`0x${raw.slice(i, i + 64)}`));
  }
  return words;
};

export const decodeAddress = (hex: string): string => {
  const [word] = decodeWords(hex);
  return `0x${(word ?? 0n).toString(16).padStart(40, "0").slice(-40)}`;
};

/** Decode a single dynamic `uint256[]` return value. */
export const decodeUintArray = (hex: string): bigint[] => {
  const words = decodeWords(hex);
  const offsetIndex = Number((words[0] ?? 0n) / 32n);
  const length = Number(words[offsetIndex] ?? 0n);
  const values = words.slice(offsetIndex + 1, offsetIndex + 1 + length);
  if (values.length !== length) {
    throw new Error("Malformed uint256[] ABI result.");
  }
  return values;
};
