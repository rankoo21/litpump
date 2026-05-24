"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

export type CurveStats = {
  volume24h: bigint;
  txCount24h: number;
  priceChange24h: number;
  loading: boolean;
};

/**
 * Reads 24h stats for a curve from the local indexer API. Previous RPC-driven
 * implementation has been replaced; this one is O(1) per render.
 */
export function useCurveStats(curve: Address | undefined): CurveStats {
  const [stats, setStats] = useState<CurveStats>({
    volume24h: 0n,
    txCount24h: 0,
    priceChange24h: 0,
    loading: true,
  });

  useEffect(() => {
    if (!curve) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/trades/${curve}?limit=1`);
        const data = await res.json();
        if (cancelled) return;
        const s = data.stats ?? {};
        setStats({
          volume24h: BigInt(s.volume24h ?? "0"),
          txCount24h: Number(s.txCount24h ?? 0),
          priceChange24h: Number(s.priceChange24h ?? 0),
          loading: false,
        });
      } catch {
        if (!cancelled) setStats((p) => ({ ...p, loading: false }));
      }
    }
    void load();
    const id = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [curve]);

  return stats;
}
