"use client";

import { useEffect, useState } from "react";
import { type Address } from "viem";
import { fmtLtc, fmtTokens, shortAddr } from "@/lib/format";
import { TokenImage } from "./TokenImage";
import Link from "next/link";
import type { TokenItem } from "./TokenCard";

type Tick = {
  kind: "buy" | "sell";
  who: Address;
  token: Address;
  symbol: string;
  imageURI: string;
  ltc: bigint;
  tokens: bigint;
  ts: number;
  tx: `0x${string}`;
};

/**
 * Top-of-page live trades scroller. Pulls aggregated ticks from the local
 * indexer API instead of replaying RPC logs on every render — much cheaper at
 * scale, and the data is identical.
 */
export function LiveTicker({ tokens }: { tokens: TokenItem[] }) {
  const [ticks, setTicks] = useState<Tick[]>([]);

  useEffect(() => {
    if (tokens.length === 0) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/ticker?limit=30", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const items = (data.trades ?? []) as Array<any>;
        setTicks(
          items.map((t) => ({
            kind: t.kind,
            who: t.who as Address,
            token: t.token as Address,
            symbol: t.symbol,
            imageURI: t.imageURI,
            ltc: BigInt(t.ltc),
            tokens: BigInt(t.tokens),
            ts: t.ts,
            tx: t.txHash as `0x${string}`,
          }))
        );
      } catch {
        /* ticker is decorative */
      }
    }
    void load();
    const id = setInterval(load, 8_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tokens.length]);

  if (ticks.length === 0) return null;
  // Duplicate the list so the marquee scrolls seamlessly.
  const strip = [...ticks, ...ticks];

  return (
    <div className="relative overflow-hidden border-y border-bg-border bg-bg-soft/40">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {strip.map((t, i) => (
          <Link
            key={`${t.tx}-${t.kind}-${i}`}
            href={`/token/${t.token}`}
            className="inline-flex items-center gap-2 px-4 text-xs text-zinc-400 hover:text-zinc-100"
          >
            <span className="font-mono text-zinc-500">{shortAddr(t.who)}</span>
            <span className={t.kind === "buy" ? "text-accent" : "text-rose-400"}>
              {t.kind === "buy" ? "Bought" : "Sold"}
            </span>
            <span className="font-mono">{fmtTokens(t.tokens)}</span>
            <TokenImage src={t.imageURI} symbol={t.symbol} size="sm" />
            <span className="text-zinc-300">{t.symbol}</span>
            <span className="text-zinc-600">for</span>
            <span className="font-mono">{fmtLtc(t.ltc, 4)} zkLTC</span>
            <span className="text-zinc-700">·</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
