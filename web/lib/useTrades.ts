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
 * Single shared subscription to the trades feed for one curve.
 *
 * All components (chart, recent trades table, stats card) read from the same
 * cache via React Query. Without this they each polled independently, picking
 * up different snapshots a few seconds apart — the UI looked flickery because
 * one widget would have a new trade while another still showed the old list.
 */
export function useTrades(curve: Address | string | undefined, limit = 200) {
  const enabled = !!curve;
  return useQuery<Resp>({
    queryKey: ["trades", curve, limit],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/trades/${curve}?limit=${limit}`);
      if (!res.ok) throw new Error("Trades unavailable");
      return res.json();
    },
    refetchInterval: 8_000,
    staleTime:       4_000,
    placeholderData: (prev) => prev,
  });
}
