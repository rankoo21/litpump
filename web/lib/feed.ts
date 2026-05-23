/**
 * Cache-backed feed builder.
 *
 * The unrefactored UI fanned out one `getLogs` per curve plus an N+1 `getBlock`
 * per log per page render. With even 50 tokens and a few dozen trades each
 * that becomes 100s of RPC calls per refresh — untenable.
 *
 * This module aggregates everything the home page + leaderboard need into a
 * single `getFeed()` call:
 *
 *   1. listTokens() once per refresh
 *   2. multicall over every curve for live state (price, mcap, graduated…)
 *   3. one `getLogs` over all curves for the last 24h
 *   4. dedupe block fetches via Promise.all on the unique block numbers
 *
 * Results are cached for `CACHE_TTL_MS` and shared across all callers so a
 * burst of identical requests collapses to a single round of RPC traffic.
 *
 * This is intentionally process-local — for production scaling, swap this for
 * a real indexer (Ponder, subgraph) backed by Postgres.
 */

import { createPublicClient, decodeEventLog, formatUnits, http, type Address, type Log } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, ERC20_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS } from "@/lib/contracts";

export type FeedToken = {
  // Static info (mirrors TokenInfo from the factory).
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  imageURI: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  createdAt: number;          // unix seconds

  // Live curve state (read via multicall).
  priceX1e18:   string;       // bigint serialised
  marketCapLtc: string;
  ltcCollected: string;
  tokensSold:   string;
  graduated:    boolean;
  migrated:     boolean;
  graduationProgressPct: number;

  // Derived from event scan.
  volume24h:       string;    // sum of zkLTC traded over the last 24h
  txCount24h:      number;
  priceChange24h:  number;    // percent change vs first trade in window
  lastTradeTs:     number;    // unix seconds, 0 if no trades
};

export type Feed = {
  tokens:      FeedToken[];
  totals: {
    tokens:     number;
    graduated:  number;
    marketCap:  string;
    raised:     string;
    volume24h:  string;
  };
  generatedAt: number;        // unix ms
  fromBlock:   string;
  toBlock:     string;
};

const CACHE_TTL_MS    = 8_000;
const SCAN_BLOCK_SPAN = 50_000n;

let cached:    Feed | null = null;
let cachedAt:  number = 0;
let inflight:  Promise<Feed> | null = null;

const client = createPublicClient({
  chain: liteForge,
  transport: http(liteForge.rpcUrls.default.http[0]),
});

/// Returns a cached feed if still fresh, otherwise builds a new one. Concurrent
/// callers during a build share the same in-flight promise.
export async function getFeed(): Promise<Feed> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  if (inflight)                                return inflight;

  inflight = buildFeed()
    .then((feed) => {
      cached    = feed;
      cachedAt  = Date.now();
      return feed;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function buildFeed(): Promise<Feed> {
  // 1) listTokens via the factory.
  const list = (await client.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "listTokens",
    args: [0n, 100n],
  })) as readonly any[];

  if (!list || list.length === 0) {
    return emptyFeed();
  }

  // 2) Live curve state. LitVM LiteForge has no Multicall3 deployment, so we
  //    fan out parallel `eth_call`s instead of bundling. ~7 calls per token —
  //    fine at testnet scale, and safer than crashing on missing multicall3.
  const liveCalls = list.flatMap((t) => [
    { address: t.curve, abi: CURVE_ABI, functionName: "currentPriceX1e18"        } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "marketCapLtc"             } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "ltcCollected"             } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "tokensSold"               } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "graduated"                } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "migrated"                 } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "graduationProgressX1e18"  } as const,
  ]);
  const live = await Promise.all(
    liveCalls.map(async (c) => {
      try {
        const result = await client.readContract({
          address:      c.address,
          abi:          c.abi,
          functionName: c.functionName,
        });
        return { result, status: "success" as const };
      } catch (err) {
        return { error: err, result: undefined, status: "failure" as const };
      }
    })
  );

  // 3) One `getLogs` across every curve for the configured window.
  const latest    = await client.getBlockNumber();
  const fromBlock = latest > SCAN_BLOCK_SPAN ? latest - SCAN_BLOCK_SPAN : 0n;
  const curveAddrs = list.map((t) => t.curve as Address);
  const logs = await client.getLogs({
    address:   curveAddrs,
    fromBlock,
    toBlock:   latest,
  });

  // Dedupe block timestamps. Many trades share blocks; this collapses N+1 to ~uniqueBlocks.
  const uniqueBlocks = Array.from(new Set(logs.map((l) => l.blockNumber!)));
  const blockTs = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      const b = await client.getBlock({ blockNumber: bn });
      blockTs.set(bn, Number(b.timestamp));
    })
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - 24 * 3600;

  // 4) Per-curve aggregation.
  type Agg = {
    volume24h:      bigint;
    txCount24h:     number;
    firstPrice24h:  number | null;
    lastPrice:      number | null;
    lastTradeTs:    number;
  };
  const agg = new Map<string, Agg>();
  for (const t of list) {
    agg.set(t.curve.toLowerCase(), {
      volume24h:     0n,
      txCount24h:    0,
      firstPrice24h: null,
      lastPrice:     null,
      lastTradeTs:   0,
    });
  }

  for (const log of logs) {
    let parsed:
      | { eventName: "Bought"; args: { ltcIn: bigint; newPriceX1e18: bigint } }
      | { eventName: "Sold";   args: { ltcOut: bigint; newPriceX1e18: bigint } }
      | undefined;
    try {
      parsed = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics }) as any;
    } catch {
      continue;
    }
    if (!parsed || (parsed.eventName !== "Bought" && parsed.eventName !== "Sold")) continue;

    const a = agg.get(log.address.toLowerCase());
    if (!a) continue;

    const ts    = blockTs.get(log.blockNumber!) ?? 0;
    const price = Number(formatUnits((parsed.args as any).newPriceX1e18, 18));
    a.lastPrice   = price;
    a.lastTradeTs = Math.max(a.lastTradeTs, ts);

    if (ts >= cutoff) {
      if (a.firstPrice24h === null) a.firstPrice24h = price;
      const ltc = parsed.eventName === "Bought" ? (parsed.args as any).ltcIn : (parsed.args as any).ltcOut;
      a.volume24h  += ltc as bigint;
      a.txCount24h += 1;
    }
  }

  // 5) Compose the feed entries.
  const tokens: FeedToken[] = list.map((t, i) => {
    const a = agg.get((t.curve as string).toLowerCase())!;
    const priceX1e18    = (live[i * 7 + 0]?.result as bigint) ?? 0n;
    const marketCapLtc  = (live[i * 7 + 1]?.result as bigint) ?? 0n;
    const ltcCollected  = (live[i * 7 + 2]?.result as bigint) ?? 0n;
    const tokensSold    = (live[i * 7 + 3]?.result as bigint) ?? 0n;
    const graduated     = (live[i * 7 + 4]?.result as boolean) ?? false;
    const migrated      = (live[i * 7 + 5]?.result as boolean) ?? false;
    const progressX1e18 = (live[i * 7 + 6]?.result as bigint) ?? 0n;

    const priceChange24h =
      a.firstPrice24h !== null && a.lastPrice !== null && a.firstPrice24h > 0
        ? ((a.lastPrice - a.firstPrice24h) / a.firstPrice24h) * 100
        : 0;

    return {
      token:       t.token,
      curve:       t.curve,
      creator:     t.creator,
      name:        t.name,
      symbol:      t.symbol,
      imageURI:    t.imageURI,
      description: t.description,
      twitter:     t.twitter,
      telegram:    t.telegram,
      website:     t.website,
      createdAt:   Number(t.createdAt),

      priceX1e18:   priceX1e18.toString(),
      marketCapLtc: marketCapLtc.toString(),
      ltcCollected: ltcCollected.toString(),
      tokensSold:   tokensSold.toString(),
      graduated,
      migrated,
      graduationProgressPct: Number(progressX1e18) / 1e16,

      volume24h:      a.volume24h.toString(),
      txCount24h:     a.txCount24h,
      priceChange24h,
      lastTradeTs:    a.lastTradeTs,
    };
  });

  const totals = tokens.reduce(
    (acc, t) => {
      acc.marketCap += BigInt(t.marketCapLtc);
      acc.raised    += BigInt(t.ltcCollected);
      acc.volume24h += BigInt(t.volume24h);
      if (t.graduated) acc.graduated += 1;
      return acc;
    },
    { marketCap: 0n, raised: 0n, volume24h: 0n, graduated: 0, tokens: tokens.length }
  );

  return {
    tokens,
    totals: {
      tokens:    totals.tokens,
      graduated: totals.graduated,
      marketCap: totals.marketCap.toString(),
      raised:    totals.raised.toString(),
      volume24h: totals.volume24h.toString(),
    },
    generatedAt: Date.now(),
    fromBlock:   fromBlock.toString(),
    toBlock:     latest.toString(),
  };
}

function emptyFeed(): Feed {
  return {
    tokens: [],
    totals: { tokens: 0, graduated: 0, marketCap: "0", raised: "0", volume24h: "0" },
    generatedAt: Date.now(),
    fromBlock: "0",
    toBlock:   "0",
  };
}
