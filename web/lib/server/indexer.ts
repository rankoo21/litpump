import "server-only";

import Database from "better-sqlite3";
import { createPublicClient, http, decodeEventLog, type Address, type Log } from "viem";
import path from "node:path";
import fs from "node:fs";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, isFactoryConfigured } from "@/lib/contracts";

const POLL_INTERVAL_MS = 8_000;
const SCAN_BATCH       = 5_000n;
const STARTING_OFFSET  = 200_000n;
const DATA_DIR         = path.join(process.cwd(), ".indexer");
const DB_PATH          = path.join(DATA_DIR, "litpump.db");
// Types

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
  ltc: string;       // bigint serialised as decimal string
  tokens: string;
  priceX1e18: string;
  ltcCollected: string;
  tokensSold: string;
  ts: number;
  blockNumber: number;
  txHash: `0x${string}`;
  logIndex: number;
};


let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      address     TEXT PRIMARY KEY,
      curve       TEXT NOT NULL,
      creator     TEXT NOT NULL,
      name        TEXT NOT NULL,
      symbol      TEXT NOT NULL,
      image_uri   TEXT NOT NULL,
      description TEXT NOT NULL,
      twitter     TEXT NOT NULL,
      telegram    TEXT NOT NULL,
      website     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      block       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tokens_curve   ON tokens(curve);
    CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);

    CREATE TABLE IF NOT EXISTS trades (
      tx_hash    TEXT NOT NULL,
      log_index  INTEGER NOT NULL,
      curve      TEXT NOT NULL,
      token      TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK(kind IN ('buy','sell')),
      who        TEXT NOT NULL,
      ltc        TEXT NOT NULL,
      tokens     TEXT NOT NULL,
      price_x18  TEXT NOT NULL,
      ltc_total  TEXT NOT NULL,
      sold_total TEXT NOT NULL,
      ts         INTEGER NOT NULL,
      block      INTEGER NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );
    CREATE INDEX IF NOT EXISTS idx_trades_curve_ts ON trades(curve, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_who_ts   ON trades(who,   ts DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_ts       ON trades(ts DESC);

    CREATE TABLE IF NOT EXISTS curve_state (
      curve     TEXT PRIMARY KEY,
      graduated INTEGER NOT NULL DEFAULT 0,
      migrated  INTEGER NOT NULL DEFAULT 0,
      lp_pair   TEXT
    );

    CREATE TABLE IF NOT EXISTS holders (
      token   TEXT NOT NULL,
      holder  TEXT NOT NULL,
      balance TEXT NOT NULL,
      PRIMARY KEY (token, holder)
    );
    CREATE INDEX IF NOT EXISTS idx_holders_token ON holders(token);
  `);
  _db = d;
  return d;
}

function getMeta(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

function setMeta(key: string, value: string) {
  db().prepare(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}


const rpc = createPublicClient({ chain: liteForge, transport: http() });


let _running = false;
let _started = false;

/** Start the singleton background indexer. Idempotent across hot reloads. */
export function startIndexer() {
  // Tolerate Next.js dev-server hot reloads by pinning a flag onto globalThis.
  const G = globalThis as unknown as { __litpumpIndexerStarted?: boolean };
  if (G.__litpumpIndexerStarted) return;
  G.__litpumpIndexerStarted = true;
  _started = true;

  if (!isFactoryConfigured) return;

  const loop = async () => {
    if (_running) return;
    _running = true;
    try {
      await tick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[indexer] tick failed:", err);
    } finally {
      _running = false;
    }
  };
  // Initial run + periodic poll.
  void loop();
  setInterval(loop, POLL_INTERVAL_MS);
}

/** One pass over new blocks since the last checkpoint. */
async function tick() {
  const latest = await rpc.getBlockNumber();
  const checkpoint = BigInt(getMeta("last_block") ?? (latest > STARTING_OFFSET ? (latest - STARTING_OFFSET).toString() : "0"));

  let from = checkpoint + 1n;
  if (from > latest) return;

  while (from <= latest) {
    const to = from + SCAN_BATCH - 1n > latest ? latest : from + SCAN_BATCH - 1n;
    await scanRange(from, to);
    setMeta("last_block", to.toString());
    from = to + 1n;
  }
}

async function scanRange(from: bigint, to: bigint) {
  // 1. Pull factory `TokenLaunched` events.
  const factoryLogs = await rpc.getLogs({
    address: FACTORY_ADDRESS,
    fromBlock: from,
    toBlock:   to,
  });

  for (const log of factoryLogs) {
    try {
      const parsed = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
      if (parsed.eventName !== "TokenLaunched") continue;
      await ingestLaunch(log, parsed.args as any);
    } catch { /* not our event */ }
  }

  // 2. Pull every curve's `Bought` / `Sold` / `Graduated` / `Migrated`. Multi-address
  //    filter so this is one RPC call regardless of token count.
  const curves = (db().prepare("SELECT DISTINCT curve FROM tokens").all() as { curve: string }[])
    .map((r) => r.curve as Address);
  if (curves.length === 0) return;

  const tradeLogs = await rpc.getLogs({
    address: curves,
    fromBlock: from,
    toBlock:   to,
  });

  // 3. Pull every token's ERC-20 `Transfer` events so we can rebuild holder balances.
  const tokenAddrs = (db().prepare("SELECT address FROM tokens").all() as { address: string }[])
    .map((r) => r.address as Address);
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let transferLogs: any[] = [];
  if (tokenAddrs.length > 0) {
    try {
      transferLogs = await rpc.getLogs({
        address: tokenAddrs,
        event: {
          type: "event",
          name: "Transfer",
          inputs: [
            { name: "from",  type: "address", indexed: true },
            { name: "to",    type: "address", indexed: true },
            { name: "value", type: "uint256", indexed: false },
          ],
        },
        fromBlock: from,
        toBlock:   to,
      });
    } catch { /* RPC may reject the filter for very wide ranges; ignore and resume next tick */ }
  }

  // Batch block-timestamp reads.
  const uniqueBlocks = Array.from(new Set(tradeLogs.map((l) => l.blockNumber!)));
  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      const b = await rpc.getBlock({ blockNumber: bn });
      blockTimes.set(bn, Number(b.timestamp));
    })
  );

  const insertTrade = db().prepare(
    `INSERT OR IGNORE INTO trades
     (tx_hash, log_index, curve, token, kind, who, ltc, tokens, price_x18, ltc_total, sold_total, ts, block)
     VALUES (@tx_hash, @log_index, @curve, @token, @kind, @who, @ltc, @tokens, @price_x18, @ltc_total, @sold_total, @ts, @block)`
  );
  const upsertState = db().prepare(
    `INSERT INTO curve_state (curve, graduated, migrated, lp_pair) VALUES (?, ?, ?, ?)
     ON CONFLICT(curve) DO UPDATE SET graduated = excluded.graduated, migrated = excluded.migrated, lp_pair = excluded.lp_pair`
  );

  // Holder balance helpers — running totals stored as decimal strings.
  const getHolder = db().prepare("SELECT balance FROM holders WHERE token = ? AND holder = ?");
  const setHolder = db().prepare(
    `INSERT INTO holders(token, holder, balance) VALUES(?, ?, ?)
     ON CONFLICT(token, holder) DO UPDATE SET balance = excluded.balance`
  );
  const delHolder = db().prepare("DELETE FROM holders WHERE token = ? AND holder = ?");

  function applyDelta(token: string, holder: string, delta: bigint) {
    if (holder === "0x0000000000000000000000000000000000000000") return;
    const row = getHolder.get(token, holder) as { balance: string } | undefined;
    const current = row ? BigInt(row.balance) : 0n;
    const next = current + delta;
    if (next <= 0n) {
      delHolder.run(token, holder);
    } else {
      setHolder.run(token, holder, next.toString());
    }
  }

  // Cache curve → token meta lookups.
  const meta = new Map<string, { token: string; symbol: string }>();
  const metaRows = db().prepare("SELECT address, curve, symbol FROM tokens").all() as
    { address: string; curve: string; symbol: string }[];
  for (const r of metaRows) meta.set(r.curve.toLowerCase(), { token: r.address, symbol: r.symbol });

  const tx = db().transaction(() => {
    for (const log of tradeLogs) {
      const parsed = (() => {
        try {
          return decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics });
        } catch {
          return null;
        }
      })();
      if (!parsed) continue;

      const m = meta.get(log.address.toLowerCase());
      if (!m) continue;

      if (parsed.eventName === "Bought" || parsed.eventName === "Sold") {
        const a = parsed.args as any;
        const kind = parsed.eventName === "Bought" ? "buy" : "sell";
        insertTrade.run({
          tx_hash:    log.transactionHash!,
          log_index:  log.logIndex!,
          curve:      log.address.toLowerCase(),
          token:      m.token.toLowerCase(),
          kind,
          who:        (parsed.eventName === "Bought" ? a.buyer : a.seller).toLowerCase(),
          ltc:        ((parsed.eventName === "Bought" ? a.ltcIn : a.ltcOut) as bigint).toString(),
          tokens:     ((parsed.eventName === "Bought" ? a.tokensOut : a.tokensIn) as bigint).toString(),
          price_x18:  (a.newPriceX1e18 as bigint).toString(),
          ltc_total:  (a.ltcCollected as bigint).toString(),
          sold_total: (a.tokensSold as bigint).toString(),
          ts:         blockTimes.get(log.blockNumber!) ?? 0,
          block:      Number(log.blockNumber!),
        });
      } else if (parsed.eventName === "Graduated") {
        upsertState.run(log.address.toLowerCase(), 1, 0, null);
      } else if (parsed.eventName === "Migrated") {
        const a = parsed.args as any;
        upsertState.run(log.address.toLowerCase(), 1, 1, (a.pair as string).toLowerCase());
      }
    }

    // Apply Transfer deltas to the holders table.
    for (const log of transferLogs) {
      try {
        const parsed = decodeEventLog({
          abi: [{
            type: "event",
            name: "Transfer",
            inputs: [
              { name: "from",  type: "address", indexed: true },
              { name: "to",    type: "address", indexed: true },
              { name: "value", type: "uint256", indexed: false },
            ],
          }],
          data: log.data,
          topics: log.topics,
        });
        const a = parsed.args as any;
        const token = (log.address as string).toLowerCase();
        const from  = (a.from as string).toLowerCase();
        const to    = (a.to   as string).toLowerCase();
        const v     = a.value as bigint;
        applyDelta(token, from, -v);
        applyDelta(token, to,    v);
      } catch { /* not a transfer */ }
    }
  });
  tx();
}

async function ingestLaunch(log: Log, args: any) {
  const tokenAddr = (args.token as Address).toLowerCase();
  const block = await rpc.getBlock({ blockNumber: log.blockNumber! });

  // The full TokenInfo (description, twitter, telegram, website) isn't in the
  // event topics — we read it back from the factory storage by token index.
  const factoryAbi = FACTORY_ABI;
  let info: any = null;
  try {
    const idx = (await rpc.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: "tokenIndexPlusOne",
      args: [args.token as Address],
    })) as bigint;
    if (idx > 0n) {
      info = await rpc.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "getToken",
        args: [idx - 1n],
      });
    }
  } catch { /* fall back to event args only */ }

  db().prepare(
    `INSERT OR IGNORE INTO tokens
     (address, curve, creator, name, symbol, image_uri, description, twitter, telegram, website, created_at, block)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tokenAddr,
    (args.curve as string).toLowerCase(),
    (args.creator as string).toLowerCase(),
    String(args.name ?? info?.name ?? ""),
    String(args.symbol ?? info?.symbol ?? ""),
    String(args.imageURI ?? info?.imageURI ?? ""),
    String(info?.description ?? ""),
    String(info?.twitter ?? ""),
    String(info?.telegram ?? ""),
    String(info?.website ?? ""),
    Number(block.timestamp),
    Number(log.blockNumber!),
  );
}


export function listTokens(limit = 100, offset = 0): TokenRow[] {
  startIndexer();
  return (db().prepare(
    `SELECT * FROM tokens ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as any[]).map(rowToToken);
}

export function trendingByVolume(windowSecs = 86_400, limit = 20): TokenRow[] {
  startIndexer();
  const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
  return (db().prepare(
    `SELECT t.*, COALESCE(SUM(CAST(tr.ltc AS REAL)), 0) AS volume
     FROM tokens t
     LEFT JOIN trades tr ON tr.token = t.address AND tr.ts >= ?
     GROUP BY t.address
     ORDER BY volume DESC, t.created_at DESC
     LIMIT ?`
  ).all(cutoff, limit) as any[]).map(rowToToken);
}

export function recentTrades(curve: string, limit = 50): TradeRow[] {
  startIndexer();
  const c = curve.toLowerCase();
  const rows = db().prepare(
    `SELECT tr.*, t.symbol AS t_symbol, t.image_uri AS t_image
       FROM trades tr
       LEFT JOIN tokens t ON t.curve = tr.curve
       WHERE tr.curve = ?
       ORDER BY tr.ts DESC
       LIMIT ?`
  ).all(c, limit) as any[];
  return rows.map(rowToTrade);
}

export function liveTicker(limit = 30): TradeRow[] {
  startIndexer();
  const rows = db().prepare(
    `SELECT tr.*, t.symbol AS t_symbol, t.image_uri AS t_image
       FROM trades tr
       LEFT JOIN tokens t ON t.curve = tr.curve
       ORDER BY tr.ts DESC
       LIMIT ?`
  ).all(limit) as any[];
  return rows.map(rowToTrade);
}

export function userTransactions(user: string, limit = 100): TradeRow[] {
  startIndexer();
  const rows = db().prepare(
    `SELECT tr.*, t.symbol AS t_symbol, t.image_uri AS t_image
       FROM trades tr
       LEFT JOIN tokens t ON t.curve = tr.curve
       WHERE tr.who = ?
       ORDER BY tr.ts DESC
       LIMIT ?`
  ).all(user.toLowerCase(), limit) as any[];
  return rows.map(rowToTrade);
}

export function userLaunches(user: string): TokenRow[] {
  startIndexer();
  return (db().prepare(
    `SELECT * FROM tokens WHERE creator = ? ORDER BY created_at DESC`
  ).all(user.toLowerCase()) as any[]).map(rowToToken);
}

export function curveStats24h(curve: string): { volume24h: string; txCount24h: number; priceChange24h: number } {
  startIndexer();
  const c = curve.toLowerCase();
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  const row = db().prepare(
    `SELECT COALESCE(SUM(CAST(ltc AS REAL)), 0) AS vol, COUNT(*) AS n
       FROM trades WHERE curve = ? AND ts >= ?`
  ).get(c, cutoff) as { vol: number; n: number };

  const first = db().prepare(
    `SELECT price_x18 FROM trades WHERE curve = ? AND ts >= ? ORDER BY ts ASC  LIMIT 1`
  ).get(c, cutoff) as { price_x18: string } | undefined;
  const last = db().prepare(
    `SELECT price_x18 FROM trades WHERE curve = ? ORDER BY ts DESC LIMIT 1`
  ).get(c) as { price_x18: string } | undefined;

  let priceChange = 0;
  if (first && last) {
    const f = Number(BigInt(first.price_x18)) / 1e18;
    const l = Number(BigInt(last.price_x18))  / 1e18;
    if (f > 0) priceChange = ((l - f) / f) * 100;
  }
  return {
    volume24h: BigInt(Math.floor(row.vol)).toString(),
    txCount24h: row.n,
    priceChange24h: priceChange,
  };
}


function rowToToken(r: any): TokenRow {
  return {
    address:     r.address,
    curve:       r.curve,
    creator:     r.creator,
    name:        r.name,
    symbol:      r.symbol,
    imageURI:    r.image_uri,
    description: r.description,
    twitter:     r.twitter,
    telegram:    r.telegram,
    website:     r.website,
    createdAt:   r.created_at,
    blockNumber: r.block,
  };
}

function rowToTrade(r: any): TradeRow {
  return {
    curve:        r.curve,
    token:        r.token,
    symbol:       r.t_symbol ?? "",
    imageURI:     r.t_image  ?? "",
    kind:         r.kind,
    who:          r.who,
    ltc:          r.ltc,
    tokens:       r.tokens,
    priceX1e18:   r.price_x18,
    ltcCollected: r.ltc_total,
    tokensSold:   r.sold_total,
    ts:           r.ts,
    blockNumber:  r.block,
    txHash:       r.tx_hash,
    logIndex:     r.log_index,
  };
}


export type HolderRow = { address: Address; balance: string };

export function topHolders(token: string, limit = 12): HolderRow[] {
  startIndexer();
  const rows = db().prepare(
    `SELECT holder, balance FROM holders WHERE token = ?
     ORDER BY CAST(balance AS REAL) DESC
     LIMIT ?`
  ).all(token.toLowerCase(), limit) as { holder: string; balance: string }[];
  return rows.map((r) => ({ address: r.holder as Address, balance: r.balance }));
}
