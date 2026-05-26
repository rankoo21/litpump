"use client";

import { useQuery } from "@tanstack/react-query";
import type { Feed } from "@/lib/feed";

/**
 * Polls the cached `/api/feed` endpoint and exposes the latest snapshot.
 *
 * Uses React Query's `placeholderData` so a slow refresh never blanks the
 * grid — the previous tokens stay visible until a new snapshot is ready.
 */
export function useFeed(): { feed: Feed | null; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery<Feed>({
    queryKey: ["feed"],
    queryFn: async () => {
      const res  = await fetch("/api/feed");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Feed unavailable");
      }
      return (await res.json()) as Feed;
    },
    refetchInterval: 8_000,
    staleTime:       4_000,
    placeholderData: (prev) => prev,
    retry:           2,
    retryDelay:      1_000,
  });
  return {
    feed:    data ?? null,
    loading: isLoading,
    error:   error ? (error as Error).message : null,
  };
}
