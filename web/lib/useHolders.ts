"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

export type RawHolder = { address: string; balance: string };

/**
 * Top holders for a token, shared across consumers.
 *
 * Using React Query's `placeholderData: (prev) => prev` means an empty or
 * failed response (which used to happen when the indexer briefly returned
 * `[]` between RPC retries) doesn't blank the UI. Users see the last good
 * snapshot until a real one replaces it.
 */
export function useHolders(token: Address | string | undefined, limit = 12) {
  return useQuery<{ holders: RawHolder[] }>({
    queryKey: ["holders", token, limit],
    enabled:  !!token,
    queryFn: async () => {
      const res = await fetch(`/api/holders/${token}?limit=${limit}`);
      if (!res.ok) throw new Error("Holders unavailable");
      const data = await res.json();
      // Treat empty responses as "no fresh data yet" so the placeholder kicks in.
      if (!data.holders || data.holders.length === 0) {
        throw new Error("Holders empty");
      }
      return data;
    },
    refetchInterval:        15_000,
    staleTime:               8_000,
    placeholderData:         (prev) => prev,
    retry:                    2,
    retryDelay:               1_500,
  });
}
