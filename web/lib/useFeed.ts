"use client";

import { useEffect, useState } from "react";
import type { Feed } from "@/lib/feed";

const POLL_MS = 8_000;

/**
 * Subscribes to the cached `/api/feed` endpoint with a fixed polling interval.
 * Returns the latest snapshot plus loading / error state.
 *
 * The endpoint itself is process-cached for 8s, so polling at the same rate
 * means most fetches return immediately from RAM.
 */
export function useFeed(): { feed: Feed | null; loading: boolean; error: string | null } {
  const [feed, setFeed]       = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res  = await fetch("/api/feed", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Feed unavailable");
        if (!cancelled) {
          setFeed(data as Feed);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Feed unavailable");
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) timer = setTimeout(load, POLL_MS);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { feed, loading, error };
}
