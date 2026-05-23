"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { CURVE_ABI } from "@/lib/abi";
import { fmtLtc, shortAddr, timeAgo } from "@/lib/format";
import { TokenImage } from "./TokenImage";
import { Crown, TrendingUp } from "lucide-react";
import type { TokenItem } from "./TokenCard";

/**
 * Hero-row card that highlights the most important tokens.
 * Title slot determines the icon/label ("King of the Hill" vs "Trending").
 */
export function FeaturedToken({
  t,
  variant,
}: {
  t: TokenItem;
  variant: "king" | "trending";
}) {
  const { data: progress } = useReadContract({
    address: t.curve,
    abi: CURVE_ABI,
    functionName: "graduationProgressX1e18",
    query: { refetchInterval: 8_000 },
  });
  const { data: graduated } = useReadContract({
    address: t.curve,
    abi: CURVE_ABI,
    functionName: "graduated",
  });
  const { data: mcap } = useReadContract({
    address: t.curve,
    abi: CURVE_ABI,
    functionName: "marketCapLtc",
    query: { refetchInterval: 8_000 },
  });

  const pct = progress ? Number(progress) / 1e16 : 0;
  const isKing = variant === "king";

  return (
    <Link
      href={`/token/${t.token}`}
      className="card somnex-card relative p-4 flex items-center gap-4 transition group overflow-hidden"
    >
      {/* Decorative glow */}
      <div
        className={`absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
          isKing ? "bg-amber-400/10" : "bg-blue-500/10"
        }`}
      />

      <TokenImage src={t.imageURI} symbol={t.symbol} size="lg" />

      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-lg truncate">{t.name}</div>
          <span className="text-sm text-zinc-500">${t.symbol}</span>
          {graduated ? (
            <span className="badge badge-success">Graduated · 100%</span>
          ) : (
            <span
              className="badge"
              style={
                isKing
                  ? { color: "#facc15", borderColor: "#3a330a", background: "#21200a" }
                  : undefined
              }
            >
              {isKing ? <Crown size={11} /> : <TrendingUp size={11} />}
              {isKing ? "King of the Hill" : "Trending"}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
          <div>
            <span className="text-zinc-600 mr-1">MCAP</span>
            <span className="font-mono text-zinc-200">
              {mcap !== undefined ? fmtLtc(mcap as bigint, 2) : "…"} zkLTC
            </span>
          </div>
          <span className="text-zinc-700">·</span>
          <div>
            <span className="text-zinc-600 mr-1">Age</span>
            <span className="text-zinc-300">{timeAgo(t.createdAt)}</span>
          </div>
          <span className="text-zinc-700">·</span>
          <div className="truncate">
            <span className="text-zinc-600 mr-1">By</span>
            <span className="font-mono text-zinc-300">{shortAddr(t.creator)}</span>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2 rounded-full bg-[#001b36] overflow-hidden border border-blue-500/20">
            <div
              className="h-full progress-blue transition-[width] duration-700"
              style={{ width: `${Math.min(100, pct)}%`, minWidth: pct > 0 ? "4px" : "0px" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600 font-mono">
            <span>{pct >= 0.01 ? `${pct.toFixed(2)}%` : pct > 0 ? "<0.01%" : "0%"} to graduation</span>
            <span>{fmtLtc(mcap as bigint, 4)} / 85 zkLTC</span>
          </div>
        </div>
      </div>

      <div className="hidden sm:flex shrink-0">
        <span className="btn btn-primary text-sm pointer-events-none">Trade Now →</span>
      </div>
    </Link>
  );
}
