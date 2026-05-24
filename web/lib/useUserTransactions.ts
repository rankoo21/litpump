"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

export type UserTx = {
  kind: "launch" | "buy" | "sell";
  token: Address;
  curve: Address;
  symbol: string;
  imageURI: string;
  ltc: bigint;
  tokens: bigint;
  ts: number;
  tx: `0x${string}`;
};

/**
 * Loads a user's full activity (launches + trades) from the local indexer API.
 * Replaces an earlier RPC-scanning implementation that was O(N) per render.
 */
export function useUserTransactions(user: Address | undefined): { items: UserTx[]; loading: boolean } {
  const [items, setItems] = useState<UserTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/users/${user}`);
        const data = await res.json();
        if (cancelled) return;
        const trades = (data.trades ?? []) as Array<{
          kind: "buy" | "sell"; token: string; curve: string; symbol: string; imageURI: string;
          ltc: string; tokens: string; ts: number; txHash: string;
        }>;
        const launches = (data.launches ?? []) as Array<{
          address: string; curve: string; symbol: string; imageURI: string; createdAt: number;
        }>;
        const merged: UserTx[] = [
          ...trades.map((t) => ({
            kind: t.kind,
            token: t.token as Address,
            curve: t.curve as Address,
            symbol: t.symbol,
            imageURI: t.imageURI,
            ltc: BigInt(t.ltc),
            tokens: BigInt(t.tokens),
            ts: t.ts,
            tx: t.txHash as `0x${string}`,
          })),
          ...launches.map((l) => ({
            kind: "launch" as const,
            token: l.address as Address,
            curve: l.curve as Address,
            symbol: l.symbol,
            imageURI: l.imageURI,
            ltc: 0n,
            tokens: 0n,
            ts: l.createdAt,
            tx: ("0x" + "0".repeat(64)) as `0x${string}`,
          })),
        ].sort((a, b) => b.ts - a.ts);
        setItems(merged.slice(0, 100));
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  return { items, loading };
}
