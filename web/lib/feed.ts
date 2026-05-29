/**
 * Feed builder for the home page + leaderboard.
 *
 * The naive approach (one `getLogs` per curve, one block lookup per log)
 * collapses on a testnet RPC. We aggregate everything the UI needs into one
 * `getFeed()` call and cache the result process-locally.
 *
 * Two-tier caching:
 *   - The static side (`listTokens` page from the factory) is quasi-permanent
 *     and refreshed every `STATIC_TTL_MS` so adding tokens shows up promptly
 *     without us re-paginating it on every poll.
 *   - The live curve reads, log scan, and block timestamps refresh every
 *     `CACHE_TTL_MS` and stay in memory between requests.
 *
 * To keep RPC pressure manageable on chains with hundreds of tokens, live
 * curve state is only fetched for the top `LIVE_LIMIT` tokens. Older tokens
 * still appear in the grid with a zeroed-out live row and the right metadata.
 */

import { createPublicClient, decodeEventLog, formatUnits, http, type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS } from "@/lib/contracts";
import { serverRpcUrl } from "@/lib/rpc";

export type FeedToken = {
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
  createdAt: number;

  priceX1e18:   string;
  marketCapLtc: string;
  ltcCollected: string;
  tokensSold:   string;
  graduated:    boolean;
  migrated:     boolean;
  graduationProgressPct: number;

  volume24h:      string;
  txCount24h:     number;
  priceChange24h: number;
  lastTradeTs:    number;
};

export type Feed = {
  tokens: FeedToken[];
  totals: {
    tokens:    number;
    graduated: number;
    marketCap: string;
    raised:    string;
    volume24h: string;
  };
  generatedAt: number;
  fromBlock:   string;
  toBlock:     string;
};

// Refresh windows.
const CACHE_TTL_MS    = 10_000;
const STATIC_TTL_MS   = 5 * 60_000;    // factory token list barely changes
const SCAN_BLOCK_SPAN = 50_000n;
// Hard cap on live state fetches per refresh — beyond this we serve a degraded
// row (zero price, no graduation %). The grid still shows them with metadata.
const LIVE_LIMIT      = 80;
const RPC_BATCH       = 24;
const ADDR_BATCH      = 50;

let staticList: any[] | null = null;
let staticAt   = 0;

let cached:   Feed | null = null;
let cachedAt = 0;
let inflight: Promise<Feed> | null = null;

const client = createPublicClient({
  chain: liteForge,
  transport: http(serverRpcUrl()),
});

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

async function loadStatic(): Promise<any[]> {
  const now = Date.now();
  if (staticList && now - staticAt < STATIC_TTL_MS) return staticList;

  const out: any[] = [];
  let offset = 0n;
  const PAGE = 200n;
  while (true) {
    const page = (await client.readContract({
      address:      FACTORY_ADDRESS,
      abi:          FACTORY_ABI,
      functionName: "listTokens",
      args:         [offset, PAGE],
    })) as readonly any[];
    if (!page || page.length === 0) break;
    out.push(...page);
    if (BigInt(page.length) < PAGE) break;
    offset += PAGE;
  }
  staticList = out;
  staticAt   = Date.now();
  return out;
}

async function buildFeed(): Promise<Feed> {
  const list = await loadStatic();
  if (list.length === 0) return emptyFeed();

  // Sort newest first so live state goes to the tokens users actually see.
  const sorted = [...list].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  const liveTargets = sorted.slice(0, LIVE_LIMIT);

  // Live curve state — batched parallel calls, capped at LIVE_LIMIT × 7 reads.
  const liveCalls = liveTargets.flatMap((t) => [
    { address: t.curve, abi: CURVE_ABI, functionName: "currentPriceX1e18"        } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "marketCapLtc"             } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "ltcCollected"             } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "tokensSold"               } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "graduated"                } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "migrated"                 } as const,
    { address: t.curve, abi: CURVE_ABI, functionName: "graduationProgressX1e18"  } as const,
  ]);
  const live: Array<{ result?: any; status: "success" | "failure" }> = [];
  for (let i = 0; i < liveCalls.length; i += RPC_BATCH) {
    const slice = liveCalls.slice(i, i + RPC_BATCH);
    const out   = await Promise.all(
      slice.map(async (c) => {
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
    live.push(...out);
  }

  const liveByCurve = new Map<string, {
    priceX1e18: bigint;
    mcap:       bigint;
    raised:     bigint;
    sold:       bigint;
    graduated:  boolean;
    migrated:   boolean;
    progress:   bigint;
  }>();
  for (let i = 0; i < liveTargets.length; i++) {
    const t = liveTargets[i];
    liveByCurve.set((t.curve as string).toLowerCase(), {
      priceX1e18: (live[i * 7 + 0]?.result as bigint) ?? 0n,
      mcap:       (live[i * 7 + 1]?.result as bigint) ?? 0n,
      raised:     (live[i * 7 + 2]?.result as bigint) ?? 0n,
      sold:       (live[i * 7 + 3]?.result as bigint) ?? 0n,
      graduated:  (live[i * 7 + 4]?.result as boolean) ?? false,
      migrated:   (live[i * 7 + 5]?.result as boolean) ?? false,
      progress:   (live[i * 7 + 6]?.result as bigint) ?? 0n,
    });
  }

  // Logs over the live targets only — older tokens have static state anyway.
  const latest    = await client.getBlockNumber();
  const fromBlock = latest > SCAN_BLOCK_SPAN ? latest - SCAN_BLOCK_SPAN : 0n;
  const curveAddrs = liveTargets.map((t) => t.curve as Address);
  const logs: any[] = [];
  for (let i = 0; i < curveAddrs.length; i += ADDR_BATCH) {
    const slice = curveAddrs.slice(i, i + ADDR_BATCH);
    try {
      const part = await client.getLogs({ address: slice, fromBlock, toBlock: latest });
      logs.push(...part);
    } catch { /* skip batch */ }
  }

  const uniqueBlocks = Array.from(new Set(logs.map((l) => l.blockNumber!)));
  const blockTs      = new Map<bigint, number>();
  for (let i = 0; i < uniqueBlocks.length; i += RPC_BATCH) {
    const slice = uniqueBlocks.slice(i, i + RPC_BATCH);
    await Promise.all(
      slice.map(async (bn) => {
        try {
          const b = await client.getBlock({ blockNumber: bn });
          blockTs.set(bn, Number(b.timestamp));
        } catch {
          blockTs.set(bn, 0);
        }
      })
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - 24 * 3600;

  type Agg = {
    volume24h:     bigint;
    txCount24h:    number;
    firstPrice24h: number | null;
    lastPrice:     number | null;
    lastTradeTs:   number;
  };
  const agg = new Map<string, Agg>();
  for (const t of liveTargets) {
    agg.set((t.curve as string).toLowerCase(), {
      volume24h:     0n,
      txCount24h:    0,
      firstPrice24h: null,
      lastPrice:     null,
      lastTradeTs:   0,
    });
  }

  for (const log of logs) {
    let parsed: any;
    try {
      parsed = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics });
    } catch { continue; }
    if (!parsed || (parsed.eventName !== "Bought" && parsed.eventName !== "Sold")) continue;

    const a = agg.get(log.address.toLowerCase());
    if (!a) continue;

    const ts    = blockTs.get(log.blockNumber!) ?? 0;
    const price = Number(formatUnits(parsed.args.newPriceX1e18 as bigint, 18));
    a.lastPrice   = price;
    a.lastTradeTs = Math.max(a.lastTradeTs, ts);

    if (ts >= cutoff) {
      if (a.firstPrice24h === null) a.firstPrice24h = price;
      const ltc = parsed.eventName === "Bought" ? parsed.args.ltcIn : parsed.args.ltcOut;
      a.volume24h  += ltc as bigint;
      a.txCount24h += 1;
    }
  }

  // Compose every token in the original list — degraded rows for the long tail.
  const tokens: FeedToken[] = sorted.map((t) => {
    const curveKey = (t.curve as string).toLowerCase();
    const ls = liveByCurve.get(curveKey);
    const a  = agg.get(curveKey);

    const priceChange24h =
      a && a.firstPrice24h !== null && a.lastPrice !== null && a.firstPrice24h > 0
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

      priceX1e18:   (ls?.priceX1e18 ?? 0n).toString(),
      marketCapLtc: (ls?.mcap       ?? 0n).toString(),
      ltcCollected: (ls?.raised     ?? 0n).toString(),
      tokensSold:   (ls?.sold       ?? 0n).toString(),
      graduated:    ls?.graduated   ?? false,
      migrated:     ls?.migrated    ?? false,
      graduationProgressPct: ls ? Number(ls.progress) / 1e16 : 0,

      volume24h:      (a?.volume24h ?? 0n).toString(),
      txCount24h:     a?.txCount24h ?? 0,
      priceChange24h,
      lastTradeTs:    a?.lastTradeTs ?? 0,
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
    fromBlock:   "0",
    toBlock:     "0",
  };
}
