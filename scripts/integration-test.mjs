import axios from "axios";

const baseUrl = process.env.SAUCERSWAP_BASE_URL ?? "https://api.saucerswap.finance";
const quoteFrom = process.env.SAUCERSWAP_TEST_FROM_TOKEN;
const quoteTo = process.env.SAUCERSWAP_TEST_TO_TOKEN;
const quoteAmount = process.env.SAUCERSWAP_TEST_AMOUNT ?? "100000000";
const network = process.env.SAUCERSWAP_NETWORK === "testnet" ? "testnet" : "mainnet";
const mirrorUrl =
  process.env.SAUCERSWAP_MIRROR_NODE_URL ??
  (network === "testnet"
    ? "https://testnet.mirrornode.hedera.com"
    : "https://mainnet-public.mirrornode.hedera.com");
const routerId =
  process.env.SAUCERSWAP_ROUTER_CONTRACT_ID ??
  (network === "testnet" ? "0.0.19264" : "0.0.3045981");

const client = axios.create({
  baseURL: baseUrl,
  timeout: 10_000,
});

const request = async (path, params) => {
  try {
    const response = await client.get(path, { params });
    return { ok: true, data: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        ok: false,
        error: `${error.response?.status ?? "network"} ${error.response?.statusText ?? error.message}`,
      };
    }
    return { ok: false, error: "Unknown error" };
  }
};

const idToWord = (id) => BigInt(id.split(".")[2]).toString(16).padStart(64, "0");

/** getAmountsOut(uint256,address[]) on the V1 router. Amounts are in smallest units. */
const onChainQuote = async (from, to, amountIn) => {
  const data = `0xd06ca61f${BigInt(amountIn).toString(16).padStart(64, "0")}${"40".padStart(64, "0")}${"2".padStart(64, "0")}${idToWord(from)}${idToWord(to)}`;
  try {
    const response = await axios.post(`${mirrorUrl}/api/v1/contracts/call`, {
      to: `0x${idToWord(routerId).slice(24)}`,
      data,
      estimate: false,
      block: "latest",
    });
    const result = response.data?.result ?? "";
    return { ok: true, amountOut: BigInt(`0x${result.slice(-64)}`).toString() };
  } catch (error) {
    return { ok: false, error: axios.isAxiosError(error) ? `${error.response?.status}` : "error" };
  }
};

const run = async () => {
  let failed = false;

  const stats = await request("/stats");
  if (stats.ok) {
    console.log("stats: ok");
  } else {
    failed = true;
    console.error(`stats: ${stats.error}`);
  }

  const tokens = await request("/tokens");
  if (tokens.ok) {
    const count = Array.isArray(tokens.data) ? tokens.data.length : "unknown";
    console.log(`tokens: ${count}`);
  } else {
    failed = true;
    console.error(`tokens: ${tokens.error}`);
  }

  const pools = await request("/v2/pools");
  if (pools.ok) {
    const count = Array.isArray(pools.data) ? pools.data.length : "unknown";
    console.log(`pools v2: ${count}`);
  } else {
    failed = true;
    console.error(`pools v2: ${pools.error}`);
  }

  const farms = await request("/farms");
  if (farms.ok) {
    const count = Array.isArray(farms.data) ? farms.data.length : "unknown";
    console.log(`farms: ${count}`);
  } else {
    failed = true;
    console.error(`farms: ${farms.error}`);
  }

  if (quoteFrom && quoteTo) {
    // SaucerSwap has no REST quote endpoint; quote with the V1 router through the mirror node.
    const quote = await onChainQuote(quoteFrom, quoteTo, quoteAmount);
    if (quote.ok) {
      console.log(`quote: ok (${quoteAmount} smallest units in -> ${quote.amountOut} out)`);
    } else {
      failed = true;
      console.error(`quote: ${quote.error}`);
    }
  } else {
    console.log("quote: skipped (set SAUCERSWAP_TEST_FROM_TOKEN and SAUCERSWAP_TEST_TO_TOKEN)");
  }

  if (failed) {
    process.exitCode = 1;
  }
};

await run();
