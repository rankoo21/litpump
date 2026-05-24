"use client";

import type { Address } from "viem";
import { useTrades } from "@/lib/useTrades";

export type CurveStats = {
  volume24h:      bigint;
  txCount24h:     number;
  priceChange24h: number;
  loading:        boolean;
};

/**
 * 24h stats for a curve, derived from the same shared trades subscription as
 * the chart and recent trades table. One poll, three consumers.
 */
export function useCurveStats(curve: Address | undefined): CurveStats {
  // Share the cache key with the chart's `useTrades` so we make one request,
  // not two. The `stats` slice of the response is the same regardless of limit.
  const { data, isLoading } = useTrades(curve, 200);
  const s = data?.stats;
  return {
    volume24h:      BigInt(s?.volume24h ?? "0"),
    txCount24h:     Number(s?.txCount24h ?? 0),
    priceChange24h: Number(s?.priceChange24h ?? 0),
    loading:        isLoading,
  };
}
