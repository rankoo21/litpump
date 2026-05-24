"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { CURVE_ABI } from "@/lib/abi";
import { fmtLtc, shortAddr, timeAgo } from "@/lib/format";
import { TokenImage, resolveURI as _resolveURI } from "./TokenImage";
import { Globe, Send, Star } from "lucide-react";
import { useWatchlist } from "@/lib/useWatchlist";
import { safeUrl } from "@/lib/safeUrl";
import { XIcon } from "./icons";
import type { Address } from "viem";

export const resolveURI = _resolveURI;

export type TokenItem = {
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  imageURI: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  createdAt: bigint;
};

export function TokenCard({ t }: { t: TokenItem }) {
  const { data: progress } = useReadContract({
    address: t.curve,
    abi: CURVE_ABI,
    functionName: "graduationProgressX1e18",
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
  });

  const pct = progress ? Number(progress) / 1e16 : 0;
  const watch = useWatchlist();
  const starred = watch.hydrated && watch.has(t.token);

  const pctLabel =
    pct >= 100 ? "100%" : pct >= 1 ? pct.toFixed(2) + "%" : pct >= 0.01 ? pct.toFixed(2) + "%" : pct > 0 ? "<0.01%" : "0.0%";

  const twitterUrl  = safeUrl(t.twitter);
  const telegramUrl = safeUrl(t.telegram);
  const websiteUrl  = safeUrl(t.website);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Link
      href={`/token/${t.token}`}
      className="card-premium p-4 flex flex-col gap-3.5 group relative"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        <TokenImage src={t.imageURI} symbol={t.symbol} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-[15px] truncate text-zinc-100 leading-tight">{t.name}</div>
            <div className="text-xs text-zinc-500 font-mono">${t.symbol}</div>
          </div>

          {/* Description preview — only the first 60 chars to keep cards uniform */}
          {t.description && (
            <p className="mt-1 text-[11px] text-zinc-500 line-clamp-2 leading-snug">
              {t.description}
            </p>
          )}

          {/* Social row */}
          <div className="mt-2 flex items-center gap-1.5">
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                className="w-6 h-6 rounded-md bg-bg-soft border border-bg-border flex items-center justify-center text-zinc-500 hover:text-accent hover:border-accent/40 transition"
                title="X"
              >
                <XIcon size={10} />
              </a>
            )}
            {telegramUrl && (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                className="w-6 h-6 rounded-md bg-bg-soft border border-bg-border flex items-center justify-center text-zinc-500 hover:text-accent hover:border-accent/40 transition"
                title="Telegram"
              >
                <Send size={11} />
              </a>
            )}
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                className="w-6 h-6 rounded-md bg-bg-soft border border-bg-border flex items-center justify-center text-zinc-500 hover:text-accent hover:border-accent/40 transition"
                title="Website"
              >
                <Globe size={11} />
              </a>
            )}
          </div>
        </div>

        {/* Right column: star + percent */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              watch.toggle(t.token);
            }}
            title={starred ? "Remove from watchlist" : "Add to watchlist"}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
              starred
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-zinc-700 hover:text-zinc-300"
            }`}
          >
            <Star size={14} fill={starred ? "currentColor" : "none"} strokeWidth={2} />
          </button>
          <div
            className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold tabular-nums border ${
              graduated
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-bg-border bg-bg-soft text-zinc-200"
            }`}
          >
            {pctLabel}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="MCAP" value={`${mcap !== undefined ? fmtLtc(mcap, 2) : "…"}`} suffix="zkLTC" mono />
        <Stat label="Age"  value={timeAgo(t.createdAt)} />
        <Stat label="Addr" value={shortAddr(t.token)} mono />
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-1.5 rounded-full bg-bg-soft overflow-hidden border border-bg-border relative">
          <div
            className={`h-full transition-[width] duration-500 ${graduated ? "progress-accent" : "progress-blue"}`}
            style={{
              width: `${Math.min(100, pct).toFixed(2)}%`,
              minWidth: pct > 0 ? "4px" : "0px",
            }}
          />
        </div>
        {graduated ? (
          <div className="mt-1.5 text-[10px] text-accent font-semibold flex items-center gap-1">
            ✓ Graduated · ready for DEX
          </div>
        ) : (
          <div className="mt-1.5 text-[10px] text-zinc-600 flex justify-between font-mono">
            <span>{pctLabel} to graduation</span>
            <span>85 zkLTC</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, suffix, mono }: { label: string; value: string; suffix?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className={`mt-0.5 truncate text-zinc-200 ${mono ? "font-mono" : ""}`}>
        {value}{suffix && <span className="text-zinc-500"> {suffix}</span>}
      </div>
    </div>
  );
}
