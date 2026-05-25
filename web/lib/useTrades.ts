"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

export type RawTrade = {
  curve:        string;
  token:        string;
  symbol:       string;
  imageURI:     string;
  kind:         "buy" | "sell";
  who:          string;
  ltc:          string;       // bigint as decimal string
  tokens:       string;
  priceX1e18:   string;
  ltcCollected: string;
  tokensSold:   string;
  ts:           number;
  blockNumber:  number;
  txHash:       `0x${string}`;
  logIndex:     number;
};

export type CurveStats = {
  volume24h:      string;
  txCount24h:     number;
  priceChange24h: number;
};

type Resp = { trades: RawTrade[]; stats: CurveStats };

/**
 * Process-local pending trade store. When a user confirms a trade we drop the
 * decoded receipt log into this map so polls can merge it with whatever the
 * server returns. Entries stay until a server poll comes back with the same
 * `txHash` + `logIndex`, then we drop them. Without this, the synthetic row
 * injected after a trade would be overwritten by the next poll (which doesn't
 * yet see the trade in the indexer's snapshot).
 */
const pending = new Map<string, RawTrade[]>();
function keyFor(curve: string) { return curve.toLowerCase(); }

export function pushPendingTrade(curve: string, t: RawTrade) {
  const k    = keyFor(curve);
  const prev = pending.get(k) ?? [];
  if (prev.some((p) => p.txHash === t.txHash && p.logIndex === t.logIndex)) return;
  pending.set(k, [t, ...prev]);
}

function reconcilePending(curve: string, server: RawTrade[]): RawTrade[] {
  const k     = keyFor(curve);
  const local = pending.get(k);
  if (!local || local.length === 0) return server;

  // Drop pending entries the server has already confirmed.
  const serverHashes = new Set(server.map((t) => `${t.txHash}:${t.logIndex}`));
  const stillPending = local.filter((t) => !serverHashes.has(`${t.txHash}:${t.logIndex}`));
  pending.set(k, stillPending);
  if (stillPending.length === 0) return server;

  // Merge — pending first, then server, sorted newest first.
  const all = [...stillPending, ...server];
  all.sort((a, b) => b.ts - a.ts);
  return all;
}

/**
 * Single shared subscription to the trades feed for one curve.
 *
 * All components (chart, recent trades table, stats card) read from the same
 * cache via React Query. Server responses get reconciled with the in-memory
 * pending store so a freshly confirmed trade keeps showing until the indexer
 * catches up.
 */
export function useTrades(curve: Address | string | undefined, limit = 200) {
  const enabled = !!curve;
  return useQuery<Resp>({
    queryKey: ["trades", curve, limit],
    enabled,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/trades/${curve}?limit=${limit}`, { signal });
      if (!res.ok) throw new Error("Trades unavailable");
      const data = (await res.json()) as Resp;
      return {
        ...data,
        trades: reconcilePending(String(curve), data.trades ?? []),
      };
    },
    refetchInterval:    8_000,
    staleTime:          4_000,
    // Keep data fresh forever in the cache so navigating back to a token
    // doesn't show "No trades yet" while the next poll is in flight.
    gcTime:             5 * 60 * 1000,
    refetchOnMount:     "always",
    placeholderData:    (prev) => prev,
    retry:              2,
    retryDelay:         800,
  });
}
