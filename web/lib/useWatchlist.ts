"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "litpump:watchlist:v1";

/**
 * Lightweight, persistent client-side watchlist of token addresses.
 * Stored in localStorage and synced across tabs via the `storage` event.
 */
export function useWatchlist() {
  const [list, setList] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setList(sanitizeList(JSON.parse(raw)));
    } catch {}
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        try {
          setList(e.newValue ? sanitizeList(JSON.parse(e.newValue)) : []);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: string[]) => {
    setList(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const has = useCallback(
    (addr: string) => list.includes(addr.toLowerCase()),
    [list]
  );

  const toggle = useCallback(
    (addr: string) => {
      const a = addr.toLowerCase();
      persist(list.includes(a) ? list.filter((x) => x !== a) : [...list, a]);
    },
    [list, persist]
  );

  return { list, has, toggle, hydrated };
}
function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.toLowerCase())
        .filter((x) => /^0x[a-f0-9]{40}$/.test(x))
    )
  ).slice(0, 250);
}
