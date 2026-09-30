import { TokenId } from "@hiero-ledger/sdk";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (address: string) => address.replace(/^0x/, "").padStart(64, "0");

export const evm = (tokenId: string) => `0x${TokenId.fromString(tokenId).toSolidityAddress()}`;

export const FACTORY = `0x${"f".repeat(40)}`;

export interface FakePool {
  tokenA: string;
  tokenB: string;
  reserveA: bigint;
  reserveB: bigint;
}

const pairAddress = (index: number) => `0x${(index + 1).toString(16).padStart(40, "a")}`;

/** Constant-product output with the 0.3% V1 fee, as the router computes it. */
const amountOut = (amountIn: bigint, reserveIn: bigint, reserveOut: bigint) =>
  (amountIn * 997n * reserveOut) / (reserveIn * 1000n + amountIn * 997n);

/**
 * In-memory stand-in for the mirror node that answers the router, factory and pair calls
 * the plugin makes, backed by a list of constant-product pools.
 */
export const createFakeMirror = (
  pools: FakePool[],
  options: { allowance?: bigint; decimals?: Record<string, number> } = {},
) => {
  const findPool = (a: string, b: string) =>
    pools.findIndex(
      (p) =>
        (evm(p.tokenA) === a && evm(p.tokenB) === b) ||
        (evm(p.tokenA) === b && evm(p.tokenB) === a),
    );

  const calls: string[] = [];

  return {
    calls,
    async contractCall(to: string, data: string): Promise<string> {
      const selector = data.slice(2, 10);
      calls.push(selector);
      const body = data.slice(10);
      const words = body.match(/.{64}/g) ?? [];
      switch (selector) {
        case "d06ca61f": {
          const length = Number(BigInt(`0x${words[2]}`));
          const path = words.slice(3, 3 + length).map((w) => `0x${w.slice(24)}`);
          const amounts = [BigInt(`0x${words[0]}`)];
          for (let i = 0; i < path.length - 1; i += 1) {
            const index = findPool(path[i] as string, path[i + 1] as string);
            if (index < 0) {
              throw new Error("CONTRACT_REVERT_EXECUTED");
            }
            const pool = pools[index] as FakePool;
            const forward = evm(pool.tokenA) === path[i];
            const [rIn, rOut] = forward
              ? [pool.reserveA, pool.reserveB]
              : [pool.reserveB, pool.reserveA];
            amounts.push(amountOut(amounts[i] as bigint, rIn, rOut));
          }
          return `0x${word(32n)}${word(BigInt(amounts.length))}${amounts.map(word).join("")}`;
        }
        case "c45a0155":
          return `0x${addressWord(FACTORY)}`;
        case "e6a43905": {
          const index = findPool(`0x${words[0]?.slice(24)}`, `0x${words[1]?.slice(24)}`);
          return `0x${addressWord(index < 0 ? `0x${"0".repeat(40)}` : pairAddress(index))}`;
        }
        case "0902f1ac":
        case "0dfe1681": {
          const pool = pools.find((_, i) => pairAddress(i) === to);
          if (!pool) {
            throw new Error("unknown pair");
          }
          return selector === "0dfe1681"
            ? `0x${addressWord(evm(pool.tokenA))}`
            : `0x${word(pool.reserveA)}${word(pool.reserveB)}${word(0n)}`;
        }
        default:
          throw new Error(`unexpected selector ${selector}`);
      }
    },
    async getTokenAllowance(): Promise<bigint> {
      return options.allowance ?? 0n;
    },
    async getTokenDecimals(tokenId: string): Promise<number> {
      const decimals = options.decimals?.[tokenId];
      if (decimals === undefined) {
        throw new Error("not found");
      }
      return decimals;
    },
  };
};
