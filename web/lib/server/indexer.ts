import "server-only";

import { createPublicClient, decodeEventLog, http, type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, isFactoryConfigured } from "@/lib/contracts";
import { serverRpcUrl } from "@/lib/rpc";
import { fetchAddressLogs, fetchTokenHolders } from "@/lib/explorer";

// How many of the newest tokens we pull trade history for on each refresh.
// Trades come from the Blockscout explorer (indexed, ~1s each), so this is
// bounded parallel work rather than a slow RPC log scan across the chain.
const TRADE_TOKENS  = 60;
const CACHE_TTL_MS  = 30_000;
// Token metadata list barely changes; refresh it less often than trades.
const TOKENS_TTL_MS = 5 * 60_000;
// LiteForge block time — used to derive log timestamps by arithmetic from a
// single chain-head reference, instead of a slow getBlock per block.
const BLOCK_TIME_SECS = 0.25;

// Cached chain-head reference (block number + timestamp), refreshed briefly.
let headRef: { block: number; ts: number; at: number } | null = null;
async function blockRef(): Promise<{ block: number; ts: number } | null> {
  if (headRef && Date.now() - headRef.at < 15_000) return { block: headRef.block, ts: headRef.ts };
  try {
    const bn = await rpc.getBlockNumber();
    const b  = await rpc.getBlock({ blockNumber: bn });
    headRef = { block: Number(bn), ts: Number(b.timestamp), at: Date.now() };
    return { block: headRef.block, ts: headRef.ts };
  } catch {
    return headRef ? { block: headRef.block, ts: headRef.ts } : null;
  }
}

export type TokenRow = {
  address: Address;
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
  blockNumber: number;
};

export type TradeRow = {
  curve: Address;
  token: Address;
  symbol: string;
  imageURI: string;
  kind: "buy" | "sell";
  who: Address;
  ltc: string;
  tokens: string;
  priceX1e18: string;
  ltcCollected: string;
  tokensSold: string;
  ts: number;
  blockNumber: number;
  txHash: `0x${string}`;
  logIndex: number;
};

export type HolderRow = { address: Address; balance: string };

type Snapshot = {
  tokens: TokenRow[];                       // newest first
  trades: TradeRow[];                       // newest first
  holdersByToken: Map<string, HolderRow[]>; // token -> sorted desc
  generatedAt: number;
};

let cache: Snapshot = emptySnapshot();
let cachedAt = 0;
let inflight: Promise<Snapshot> | null = null;

// Token metadata list is cached separately (changes rarely).
let tokenList: TokenRow[] = [];
let tokenListAt = 0;

const rpc = createPublicClient({
  chain: liteForge,
  transport: http(serverRpcUrl(), { timeout: 30_000 }),
});

/**
 * Ensure the in-memory snapshot is fresh. First request after a cold start
 * blocks on the build; later requests get the cached snapshot immediately and
 * a background refresh runs (stale-while-revalidate). `force` bypasses the TTL
 * and blocks on a fresh build (used right after a user confirms a trade).
 */
export async function ensureFresh(force = false): Promise<void> {
  if (!isFactoryConfigured) return;
  const now   = Date.now();
  const stale = now - cachedAt >= CACHE_TTL_MS;
  const empty = cache.tokens.length === 0 && cachedAt === 0;

  if (!force && !stale && !empty) return;

  if (inflight) {
    if (force || empty) await inflight;
    return;
  }

  inflight = build()
    .then((snap) => {
      cache    = snap;
      cachedAt = Date.now();
      return snap;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[indexer] build failed:", err);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  if (force || empty) await inflight;
}

/** Legacy alias kept so old call sites still compile. */
export function startIndexer(): void {
  void ensureFresh();
}

/** Load (and cache) the factory's full token list, newest first. */
async function loadTokens(): Promise<TokenRow[]> {
  const now = Date.now();
  if (tokenList.length > 0 && now - tokenListAt < TOKENS_TTL_MS) return tokenList;

  const raw: any[] = [];
  let offset = 0n;
  const PAGE = 200n;
  while (true) {
    const page = (await rpc.readContract({
      address:      FACTORY_ADDRESS,
      abi:          FACTORY_ABI,
      functionName: "listTokens",
      args:         [offset, PAGE],
    })) as readonly any[];
    if (!page || page.length === 0) break;
    raw.push(...page);
    if (BigInt(page.length) < PAGE) break;
    offset += PAGE;
  }

  const rows: TokenRow[] = raw.map((t) => ({
    address:     ((t.token as string).toLowerCase()) as Address,
    curve:       ((t.curve as string).toLowerCase()) as Address,
    creator:     ((t.creator as string).toLowerCase()) as Address,
    name:        String(t.name ?? ""),
    symbol:      String(t.symbol ?? ""),
    imageURI:    String(t.imageURI ?? ""),
    description: String(t.description ?? ""),
    twitter:     String(t.twitter ?? ""),
    telegram:    String(t.telegram ?? ""),
    website:     String(t.website ?? ""),
    createdAt:   Number(t.createdAt ?? 0),
    blockNumber: 0,
  }));
  // listTokens already returns newest-first; sort defensively.
  rows.sort((a, b) => b.createdAt - a.createdAt);

  tokenList   = rows;
  tokenListAt = Date.now();
  return rows;
}

async function build(): Promise<Snapshot> {
  const tokens = await loadTokens();
  if (tokens.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[indexer] build: no tokens registered");
    return emptySnapshot();
  }

  const curveToToken = new Map<string, { token: Address; symbol: string; image: string }>();
  for (const tk of tokens) {
    curveToToken.set(tk.curve, { token: tk.address, symbol: tk.symbol, image: tk.imageURI });
  }

  // Pull trade logs for the newest tokens from the explorer, in parallel.
  const targets = tokens.slice(0, TRADE_TOKENS);
  const logsByCurve = await Promise.all(
    targets.map(async (tk) => {
      try {
        const logs = await fetchAddressLogs(tk.curve, { maxPages: 3 });
        return { curve: tk.curve, logs };
      } catch {
        return { curve: tk.curve, logs: [] as Awaited<ReturnType<typeof fetchAddressLogs>> };
      }
    }),
  );

  // Derive timestamps from the chain head + block time (one read, arithmetic).
  const ref = await blockRef();
  const tsFor = (bn: number) => (ref ? ref.ts - Math.round((ref.block - bn) * BLOCK_TIME_SECS) : 0);

  const trades: TradeRow[] = [];
  for (const { curve, logs } of logsByCurve) {
    const meta = curveToToken.get(curve);
    if (!meta) continue;
    for (const log of logs) {
      let parsed: { eventName: string; args: any } | undefined;
      try {
        parsed = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics as any }) as any;
      } catch { continue; }
      if (!parsed) continue;
      if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;

      const a     = parsed.args as any;
      const isBuy = parsed.eventName === "Bought";
      trades.push({
        curve:        curve as Address,
        token:        meta.token,
        symbol:       meta.symbol,
        imageURI:     meta.image,
        kind:         isBuy ? "buy" : "sell",
        who:          ((isBuy ? a.buyer : a.seller) as string).toLowerCase() as Address,
        ltc:          ((isBuy ? a.ltcIn  : a.ltcOut) as bigint).toString(),
        tokens:       ((isBuy ? a.tokensOut : a.tokensIn) as bigint).toString(),
        priceX1e18:   (a.newPriceX1e18 as bigint).toString(),
        ltcCollected: (a.ltcCollected as bigint).toString(),
        tokensSold:   (a.tokensSold as bigint).toString(),
        ts:           tsFor(log.blockNumber),
        blockNumber:  log.blockNumber,
        txHash:       log.transactionHash,
        logIndex:     log.logIndex,
      });
    }
  }
  trades.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });

  // eslint-disable-next-line no-console
  console.log(`[indexer] build done: tokens=${tokens.length} tradeTokens=${targets.length} trades=${trades.length}`);
  // Holders are fetched on demand (see topHolders) — no per-build work.
  return { tokens, trades, holdersByToken: new Map(), generatedAt: Date.now() };
}

function emptySnapshot(): Snapshot {
  return { tokens: [], trades: [], holdersByToken: new Map(), generatedAt: 0 };
}

// ---- Query helpers. All routes call ensureFresh() first for trades/tokens.

export function listTokens(limit = 100, offset = 0): TokenRow[] {
  return cache.tokens.slice(offset, offset + limit);
}

export function trendingByVolume(windowSecs = 86_400, limit = 20): TokenRow[] {
  const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
  const volByToken = new Map<string, bigint>();
  for (const tr of cache.trades) {
    if (tr.ts < cutoff) continue;
    volByToken.set(tr.token, (volByToken.get(tr.token) ?? 0n) + BigInt(tr.ltc));
  }
  return [...cache.tokens]
    .sort((a, b) => {
      const av = volByToken.get(a.address) ?? 0n;
      const bv = volByToken.get(b.address) ?? 0n;
      if (av !== bv) return av > bv ? -1 : 1;
      return b.createdAt - a.createdAt;
    })
    .slice(0, limit);
}

export function recentTrades(curve: string, limit = 50): TradeRow[] {
  const c = curve.toLowerCase();
  const out: TradeRow[] = [];
  for (const t of cache.trades) {
    if (t.curve.toLowerCase() === c) {
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function liveTicker(limit = 30): TradeRow[] {
  return cache.trades.slice(0, limit);
}

export function userTransactions(user: string, limit = 100): TradeRow[] {
  const u = user.toLowerCase();
  const out: TradeRow[] = [];
  for (const t of cache.trades) {
    if (t.who.toLowerCase() === u) {
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function userLaunches(user: string): TokenRow[] {
  const u = user.toLowerCase();
  return cache.tokens.filter((t) => t.creator.toLowerCase() === u);
}

export function curveStats24h(curve: string): { volume24h: string; txCount24h: number; priceChange24h: number } {
  const c      = curve.toLowerCase();
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;

  let vol = 0n;
  let n   = 0;
  let firstPrice = 0;
  let lastPrice  = 0;

  const filtered = cache.trades.filter((t) => t.curve.toLowerCase() === c);
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    if (t.ts < cutoff) break;
    vol += BigInt(t.ltc);
    n   += 1;
    if (i === 0) lastPrice = Number(BigInt(t.priceX1e18)) / 1e18;
    firstPrice = Number(BigInt(t.priceX1e18)) / 1e18;
  }
  const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  return { volume24h: vol.toString(), txCount24h: n, priceChange24h: priceChange };
}

// Per-curve trade history from the explorer, cached briefly. Used by the token
// detail route so a curve that isn't in the newest-tokens snapshot still gets
// its full trade history (and chart/stats), not an empty list.
const curveTradeCache = new Map<string, { trades: TradeRow[]; at: number }>();
const CURVE_TRADES_TTL_MS = 20_000;

export async function curveTrades(curve: string, limit = 200): Promise<TradeRow[]> {
  const key = curve.toLowerCase();
  const hit = curveTradeCache.get(key);
  if (hit && Date.now() - hit.at < CURVE_TRADES_TTL_MS) return hit.trades.slice(0, limit);

  try {
    // Only use the token list if it's already cached — don't trigger a full
    // (thousands of tokens) reload just to label one curve's trades.
    const meta =
      tokenList.length > 0 ? tokenList.find((t) => t.curve === key) : undefined;
    const logs = await fetchAddressLogs(key, { maxPages: 5 });

    // Derive block timestamps from the chain head + ~0.25s block time instead
    // of one getBlock per block (which is slow on this RPC). One reference
    // read, then arithmetic — plenty accurate for candles and 24h windows.
    const ref = await blockRef();
    const tsFor = (bn: number) => (ref ? ref.ts - Math.round((ref.block - bn) * BLOCK_TIME_SECS) : 0);

    const out: TradeRow[] = [];
    for (const log of logs) {
      let parsed: { eventName: string; args: any } | undefined;
      try {
        parsed = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics as any }) as any;
      } catch { continue; }
      if (!parsed) continue;
      if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;

      const a     = parsed.args as any;
      const isBuy = parsed.eventName === "Bought";
      out.push({
        curve:        key as Address,
        token:        (meta?.address ?? ("0x" as Address)),
        symbol:       meta?.symbol ?? "",
        imageURI:     meta?.imageURI ?? "",
        kind:         isBuy ? "buy" : "sell",
        who:          ((isBuy ? a.buyer : a.seller) as string).toLowerCase() as Address,
        ltc:          ((isBuy ? a.ltcIn  : a.ltcOut) as bigint).toString(),
        tokens:       ((isBuy ? a.tokensOut : a.tokensIn) as bigint).toString(),
        priceX1e18:   (a.newPriceX1e18 as bigint).toString(),
        ltcCollected: (a.ltcCollected as bigint).toString(),
        tokensSold:   (a.tokensSold as bigint).toString(),
        ts:           tsFor(log.blockNumber),
        blockNumber:  log.blockNumber,
        txHash:       log.transactionHash,
        logIndex:     log.logIndex,
      });
    }
    out.sort((a, b) => {
      if (b.ts !== a.ts) return b.ts - a.ts;
      if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
      return b.logIndex - a.logIndex;
    });

    curveTradeCache.set(key, { trades: out, at: Date.now() });
    return out.slice(0, limit);
  } catch {
    return hit ? hit.trades.slice(0, limit) : [];
  }
}

/** 24h stats computed from a curve's explorer trade history. */
export function statsFromTrades(trades: TradeRow[]): { volume24h: string; txCount24h: number; priceChange24h: number } {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  let vol = 0n;
  let n = 0;
  let firstPrice = 0;
  let lastPrice = 0;
  // trades sorted newest-first.
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.ts < cutoff) break;
    vol += BigInt(t.ltc);
    n += 1;
    if (i === 0) lastPrice = Number(BigInt(t.priceX1e18)) / 1e18;
    firstPrice = Number(BigInt(t.priceX1e18)) / 1e18;
  }
  const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  return { volume24h: vol.toString(), txCount24h: n, priceChange24h: priceChange };
}

// Holders come straight from the explorer's indexed balances, cached briefly
// per token so repeated polls don't refetch.
const holderCache = new Map<string, { rows: HolderRow[]; at: number }>();
const HOLDER_TTL_MS = 30_000;

export async function topHolders(token: string, limit = 12): Promise<HolderRow[]> {
  const key = token.toLowerCase();
  const hit = holderCache.get(key);
  if (hit && Date.now() - hit.at < HOLDER_TTL_MS) return hit.rows.slice(0, limit);

  try {
    const rows = (await fetchTokenHolders(key, { limit: 50 })).map((h) => ({
      address: h.address as Address,
      balance: h.balance,
    }));
    holderCache.set(key, { rows, at: Date.now() });
    return rows.slice(0, limit);
  } catch {
    return hit ? hit.rows.slice(0, limit) : [];
  }
}
