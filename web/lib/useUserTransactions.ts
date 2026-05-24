"use client";

import { useQuery } from "@tanstack/react-query";
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

const ZERO_TX = ("0x" + "0".repeat(64)) as `0x${string}`;

/**
 * Loads a user's full activity (launches + trades) from the indexer API,
 * with React Query handling polling, caching, and last-good-snapshot
 * preservation. The TradeWidget invalidates this cache after every confirmed
 * trade so the user sees their own activity immediately, not 8s later.
 */
export function useUserTransactions(user: Address | undefined): { items: UserTx[]; loading: boolean } {
  const { data, isLoading } = useQuery<{ items: UserTx[] }>({
    queryKey: ["userTxs", user],
    enabled:  !!user,
    queryFn: async () => {
      const res  = await fetch(`/api/users/${user}`);
      if (!res.ok) throw new Error("User feed unavailable");
      const data = await res.json();
      const trades = (data.trades ?? []) as Array<{
        kind: "buy" | "sell"; token: string; curve: string; symbol: string; imageURI: string;
        ltc: string; tokens: string; ts: number; txHash: string;
      }>;
      const launches = (data.launches ?? []) as Array<{
        address: string; curve: string; symbol: string; imageURI: string; createdAt: number;
      }>;
      const items: UserTx[] = [
        ...trades.map((t) => ({
          kind:     t.kind,
          token:    t.token as Address,
          curve:    t.curve as Address,
          symbol:   t.symbol,
          imageURI: t.imageURI,
          ltc:      BigInt(t.ltc),
          tokens:   BigInt(t.tokens),
          ts:       t.ts,
          tx:       t.txHash as `0x${string}`,
        })),
        ...launches.map((l) => ({
          kind:     "launch" as const,
          token:    l.address as Address,
          curve:    l.curve as Address,
          symbol:   l.symbol,
          imageURI: l.imageURI,
          ltc:      0n,
          tokens:   0n,
          ts:       l.createdAt,
          tx:       ZERO_TX,
        })),
      ].sort((a, b) => b.ts - a.ts).slice(0, 100);
      return { items };
    },
    refetchInterval:  12_000,
    staleTime:        6_000,
    placeholderData:  (prev) => prev,
  });

  return { items: data?.items ?? [], loading: isLoading };
}
