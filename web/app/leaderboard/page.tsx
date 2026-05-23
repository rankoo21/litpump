"use client";

import Link from "next/link";
import { useMemo } from "react";
import { fmtLtc, shortAddr } from "@/lib/format";
import { TokenImage } from "@/components/TokenImage";
import { useFeed } from "@/lib/useFeed";

export default function LeaderboardPage() {
  const { feed, loading } = useFeed();

  const ranked = useMemo(() => {
    const tokens = feed?.tokens ?? [];
    return [...tokens].sort((a, b) => Number(BigInt(b.marketCapLtc) - BigInt(a.marketCapLtc)));
  }, [feed]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-zinc-500">Top LitPump tokens ranked by market cap.</p>
        </div>
        <Link href="/" className="btn btn-ghost">← Explore</Link>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[48px_1fr_140px_140px_130px] gap-3 px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 border-b border-bg-border">
          <span>Rank</span>
          <span>Token</span>
          <span>24h volume</span>
          <span>Market cap</span>
          <span>Contract</span>
        </div>
        {loading && ranked.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
        ) : ranked.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">No tokens yet.</div>
        ) : (
          ranked.map((t, i) => (
            <Link
              key={t.token}
              href={`/token/${t.token}`}
              className="grid grid-cols-[48px_1fr_140px_140px_130px] gap-3 items-center px-4 py-3 border-b border-bg-border/60 hover:bg-white/[0.025] transition"
            >
              <span className="font-mono text-zinc-500">#{i + 1}</span>
              <span className="flex items-center gap-3 min-w-0">
                <TokenImage src={t.imageURI} symbol={t.symbol} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{t.name}</span>
                  <span className="block text-xs text-zinc-500 truncate">${t.symbol}</span>
                </span>
              </span>
              <span className="font-mono text-xs text-zinc-300">
                {fmtLtc(BigInt(t.volume24h), 3)} zkLTC
              </span>
              <span className="font-mono text-sm text-zinc-200">
                {fmtLtc(BigInt(t.marketCapLtc), 2)} zkLTC
              </span>
              <span className="font-mono text-xs text-zinc-500">{shortAddr(t.token)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
