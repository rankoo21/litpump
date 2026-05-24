import "server-only";

import { createPublicClient, decodeEventLog, http, type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, isFactoryConfigured } from "@/lib/contracts";

// Window of recent blocks we replay on every cold-start. Chunked across
// `SCAN_CHUNK` so we don't hit RPC range limits.
const SCAN_BLOCK_SPAN = 100_000n;
const SCAN_CHUNK      = 5_000n;
const CACHE_TTL_MS    = 12_000;

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

const rpc = createPublicClient({
  chain: liteForge,
  transport: http(liteForge.rpcUrls.default.http[0]),
});

const TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from",  type: "address", indexed: true },
    { name: "to",    type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

/**
 * Make sure the in-memory snapshot is fresh. On Vercel each cold start sees an
 * empty cache, so the first call after wakeup will block until the snapshot is
 * built. Subsequent calls within `CACHE_TTL_MS` return immediately and refresh
 * in the background.
 */
export async function ensureFresh(): Promise<void> {
  if (!isFactoryConfigured) return;
  const now = Date.now();

  if (now - cachedAt < CACHE_TTL_MS) {
    return;
  }

  if (inflight) {
    if (cache.tokens.length === 0) {
      await inflight;
    }
    return;
  }

  inflight = build()
    .then((snap) => {
      cache = snap;
      cachedAt = Date.now();
      return snap;
    })
    .catch((err) => {
      // Keep the previous cache so the UI doesn't go blank on a transient RPC failure.
      // eslint-disable-next-line no-console
      console.warn("[indexer] build failed:", err);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  if (cache.tokens.length === 0) {
    await inflight;
  }
}

/** Legacy alias kept so old call sites still compile. */
export function startIndexer(): void {
  void ensureFresh();
}

async function build(): Promise<Snapshot> {
  const list = (await rpc.readContract({
    address:      FACTORY_ADDRESS,
    abi:          FACTORY_ABI,
    functionName: "listTokens",
    args:         [0n, 200n],
  })) as readonly any[];

  if (!list || list.length === 0) return emptySnapshot();

  const latest    = await rpc.getBlockNumber();
  const fromBlock = latest > SCAN_BLOCK_SPAN ? latest - SCAN_BLOCK_SPAN : 0n;

  const curveAddrs = list.map((t) => t.curve as Address);
  const tokenAddrs = list.map((t) => t.token as Address);

  // Chunk a wide block range into RPC-friendly windows.
  const ranges: { from: bigint; to: bigint }[] = [];
  for (let f = fromBlock; f <= latest; f += SCAN_CHUNK) {
    const to = f + SCAN_CHUNK - 1n > latest ? latest : f + SCAN_CHUNK - 1n;
    ranges.push({ from: f, to });
  }

  async function getLogsAcross(args: { address: Address | Address[]; event?: any }) {
    // Run chunks in parallel — at 5k blocks per chunk × 20 chunks this is
    // tolerable. We log on hard failures so Vercel function logs surface them.
    const results = await Promise.all(
      ranges.map((r) =>
        rpc
          .getLogs({
            address:   args.address as any,
            event:     args.event,
            fromBlock: r.from,
            toBlock:   r.to,
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[indexer] getLogs chunk", r.from.toString(), "→", r.to.toString(), "failed:", err?.message ?? err);
            return [] as any[];
          })
      )
    );
    return results.flat();
  }

  // 1) Factory `TokenLaunched` logs — used to look up the on-chain creation block/timestamp.
  // 2) Curve trade events.
  // 3) Token Transfer events for holder reconstruction.
  // Run them sequentially to keep RPC pressure low on Vercel cold starts.
  const factoryLogs  = await getLogsAcross({ address: FACTORY_ADDRESS });
  const tradeLogs    = await getLogsAcross({ address: curveAddrs });
  const transferLogs = await getLogsAcross({ address: tokenAddrs, event: TRANSFER_EVENT });

  // Resolve unique block timestamps. Sequential to avoid rate-limits.
  const blockNums = new Set<bigint>();
  for (const l of factoryLogs) if (l.blockNumber) blockNums.add(l.blockNumber);
  for (const l of tradeLogs)   if (l.blockNumber) blockNums.add(l.blockNumber);
  const blockTs = new Map<bigint, number>();
  // Batch in groups of 8 — small enough to not hammer the RPC, large enough to be quick.
  const blockArr = [...blockNums];
  for (let i = 0; i < blockArr.length; i += 8) {
    const slice = blockArr.slice(i, i + 8);
    await Promise.all(
      slice.map(async (bn) => {
        try {
          const b = await rpc.getBlock({ blockNumber: bn });
          blockTs.set(bn, Number(b.timestamp));
        } catch {
          blockTs.set(bn, 0);
        }
      })
    );
  }

  // Map curve -> launch metadata.
  const launchByCurve = new Map<string, { ts: number; block: number }>();
  for (const log of factoryLogs) {
    try {
      const parsed = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
      if (parsed.eventName !== "TokenLaunched") continue;
      const a = parsed.args as any;
      launchByCurve.set((a.curve as string).toLowerCase(), {
        ts:    blockTs.get(log.blockNumber!) ?? 0,
        block: Number(log.blockNumber!),
      });
    } catch { /* not our event */ }
  }

  // Compose TokenRow[].
  const tokens: TokenRow[] = list.map((t) => {
    const meta = launchByCurve.get((t.curve as string).toLowerCase());
    return {
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
      createdAt:   meta?.ts ?? Number(t.createdAt ?? 0),
      blockNumber: meta?.block ?? 0,
    };
  });
  tokens.sort((a, b) => b.createdAt - a.createdAt);

  // Curve -> token meta lookup for trade decoding.
  const curveToToken = new Map<string, { token: Address; symbol: string; image: string }>();
  for (const tk of tokens) {
    curveToToken.set(tk.curve.toLowerCase(), {
      token:  tk.address,
      symbol: tk.symbol,
      image:  tk.imageURI,
    });
  }

  // Compose TradeRow[].
  const trades: TradeRow[] = [];
  for (const log of tradeLogs) {
    let parsed:
      | { eventName: string; args: any }
      | undefined;
    try {
      parsed = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics }) as any;
    } catch { continue; }
    if (!parsed) continue;
    if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;

    const meta = curveToToken.get(log.address.toLowerCase());
    if (!meta) continue;

    const a     = parsed.args as any;
    const isBuy = parsed.eventName === "Bought";

    trades.push({
      curve:        log.address.toLowerCase() as Address,
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
      ts:           blockTs.get(log.blockNumber!) ?? 0,
      blockNumber:  Number(log.blockNumber!),
      txHash:       log.transactionHash as `0x${string}`,
      logIndex:     log.logIndex ?? 0,
    });
  }
  trades.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });

  // Reconstruct holder balances from Transfer events. Mints come from the
  // zero address; burns go to it. We skip both endpoints in the final list.
  const balances = new Map<string, Map<string, bigint>>();
  for (const log of transferLogs) {
    let parsed: { args: any } | undefined;
    try {
      parsed = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics }) as any;
    } catch { continue; }
    if (!parsed) continue;

    const a     = parsed.args as any;
    const token = (log.address as string).toLowerCase();
    const from  = (a.from  as string).toLowerCase();
    const to    = (a.to    as string).toLowerCase();
    const v     = a.value as bigint;

    let perToken = balances.get(token);
    if (!perToken) { perToken = new Map(); balances.set(token, perToken); }

    if (from !== "0x0000000000000000000000000000000000000000") {
      perToken.set(from, (perToken.get(from) ?? 0n) - v);
    }
    if (to !== "0x0000000000000000000000000000000000000000") {
      perToken.set(to, (perToken.get(to) ?? 0n) + v);
    }
  }

  const holdersByToken = new Map<string, HolderRow[]>();
  for (const [token, perToken] of balances) {
    const rows: HolderRow[] = [];
    for (const [holder, bal] of perToken) {
      if (bal > 0n) rows.push({ address: holder as Address, balance: bal.toString() });
    }
    rows.sort((a, b) => {
      const av = BigInt(a.balance);
      const bv = BigInt(b.balance);
      if (av === bv) return 0;
      return av > bv ? -1 : 1;
    });
    holdersByToken.set(token, rows);
  }

  return { tokens, trades, holdersByToken, generatedAt: Date.now() };
}

function emptySnapshot(): Snapshot {
  return { tokens: [], trades: [], holdersByToken: new Map(), generatedAt: 0 };
}

// ---- Query helpers (sync, read from `cache`). All routes call ensureFresh() first.

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

  // cache.trades is sorted newest first.
  const filtered = cache.trades.filter((t) => t.curve.toLowerCase() === c);
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    if (t.ts < cutoff) break;
    vol += BigInt(t.ltc);
    n   += 1;
    if (i === 0) lastPrice = Number(BigInt(t.priceX1e18)) / 1e18;
    firstPrice = Number(BigInt(t.priceX1e18)) / 1e18; // overwritten until last in-window
  }
  const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  return { volume24h: vol.toString(), txCount24h: n, priceChange24h: priceChange };
}

export function topHolders(token: string, limit = 12): HolderRow[] {
  return (cache.holdersByToken.get(token.toLowerCase()) ?? []).slice(0, limit);
}
