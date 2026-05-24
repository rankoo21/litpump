"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { type Address } from "viem";
import { CURVE_ABI, ERC20_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS } from "@/lib/contracts";
import { fmtLtc, fmtPrice, fmtTokens, shortAddr } from "@/lib/format";
import { TokenImage } from "@/components/TokenImage";
import { TradeWidget } from "@/components/TradeWidget";
import { DexSwapWidget } from "@/components/DexSwapWidget";
import { PriceChart } from "@/components/PriceChart";
import { HolderDistribution } from "@/components/HolderDistribution";
import { MigrationCard } from "@/components/MigrationCard";
import { useCurveStats } from "@/components/useCurveStats";
import { useTrades } from "@/lib/useTrades";
import { TokenComments } from "@/components/TokenComments";
import { ExternalLink, Globe, Send, Star } from "lucide-react";
import { useWatchlist } from "@/lib/useWatchlist";
import { safeUrl } from "@/lib/safeUrl";
import { GraduationCelebration } from "@/components/GraduationCelebration";
import { XIcon } from "@/components/icons";
import Link from "next/link";
import { liteForge } from "@/lib/chain";

type TokenInfo = {
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

export default function TokenPage() {
  const params = useParams();
  const tokenAddress = (params?.address as string)?.toLowerCase() as Address;

  const { data: idxPlusOne } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "tokenIndexPlusOne",
    args: [tokenAddress],
  });

  const { data: info } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getToken",
    args: idxPlusOne && (idxPlusOne as bigint) > 0n ? [(idxPlusOne as bigint) - 1n] : undefined,
    query: { enabled: !!idxPlusOne && (idxPlusOne as bigint) > 0n },
  });

  const t = info as TokenInfo | undefined;

  // All hooks must run unconditionally and in the same order on every render.
  const curveStats = useCurveStats(t?.curve);
  const watch = useWatchlist();

  const stats = useReadContracts({
    contracts: t
      ? [
          { address: t.curve, abi: CURVE_ABI, functionName: "currentPriceX1e18" },
          { address: t.curve, abi: CURVE_ABI, functionName: "marketCapLtc" },
          { address: t.curve, abi: CURVE_ABI, functionName: "graduationProgressX1e18" },
          { address: t.curve, abi: CURVE_ABI, functionName: "ltcCollected" },
          { address: t.curve, abi: CURVE_ABI, functionName: "tokensSold" },
          { address: t.curve, abi: CURVE_ABI, functionName: "graduated" },
          { address: t.token, abi: ERC20_ABI, functionName: "totalSupply" },
          { address: t.curve, abi: CURVE_ABI, functionName: "migrated" },
          { address: t.curve, abi: CURVE_ABI, functionName: "lpPair" },
        ]
      : [],
    query: { enabled: !!t, refetchInterval: 5_000 },
  });

  if (!t) {
    return <div className="card p-10 text-center text-zinc-500">Loading token…</div>;
  }

  const [price, mcap, progress, ltcRaised, sold, graduated, totalSupply, migrated, lpPair] =
    (stats.data?.map((x: any) => x?.result) ?? []) as (bigint | boolean | string | undefined)[];

  const pct = progress ? Number(progress) / 1e16 : 0;
  const starred = watch.hydrated && watch.has(t.token);
  const changeColor =
    curveStats.priceChange24h > 0 ? "text-accent" : curveStats.priceChange24h < 0 ? "text-red-400" : "text-zinc-300";

  const twitterUrl  = safeUrl(t.twitter);
  const telegramUrl = safeUrl(t.telegram);
  const websiteUrl  = safeUrl(t.website);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <GraduationCelebration graduated={!!graduated} storageKey={t.curve} />
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-5">
          <div className="flex gap-4">
            <TokenImage src={t.imageURI} symbol={t.symbol} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{t.name}</h1>
                <span className="text-zinc-500">${t.symbol}</span>
                {graduated ? <span className="badge badge-success">Graduated</span> : <span className="badge">Bonding curve</span>}
                <button
                  type="button"
                  onClick={() => watch.toggle(t.token)}
                  title={starred ? "Remove from watchlist" : "Add to watchlist"}
                  className={`ml-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition ${
                    starred
                      ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10"
                      : "text-zinc-500 border-bg-border hover:text-zinc-200"
                  }`}
                >
                  <Star size={12} fill={starred ? "currentColor" : "none"} />
                  {starred ? "Watching" : "Watch"}
                </button>
              </div>
              <p className="text-sm text-zinc-400 mt-2">{t.description || "No description provided."}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                <span>creator {shortAddr(t.creator)}</span>
                <span>·</span>
                <a
                  href={`${liteForge.blockExplorers.default.url}/address/${t.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-zinc-200"
                >
                  Contract <ExternalLink size={11} />
                </a>
                {twitterUrl && (
                  <a className="inline-flex items-center gap-1 hover:text-zinc-200" href={twitterUrl} target="_blank" rel="noopener noreferrer">
                    <XIcon size={10} /> X
                  </a>
                )}
                {telegramUrl && (
                  <a className="inline-flex items-center gap-1 hover:text-zinc-200" href={telegramUrl} target="_blank" rel="noopener noreferrer">
                    <Send size={11} /> Telegram
                  </a>
                )}
                {websiteUrl && (
                  <a className="inline-flex items-center gap-1 hover:text-zinc-200" href={websiteUrl} target="_blank" rel="noopener noreferrer">
                    <Globe size={11} /> Website
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-5 gap-3 mt-5">
            <Stat label="Price" value={`${fmtPrice(price as bigint)} zkLTC`} />
            <Stat
              label="Price 24H"
              value={`${curveStats.priceChange24h > 0 ? "+" : ""}${curveStats.priceChange24h.toFixed(2)}%`}
              valueClassName={changeColor}
            />
            <Stat label="Market cap" value={`${fmtLtc(mcap as bigint, 2)} zkLTC`} />
            <Stat label="24H Volume" value={`${fmtLtc(curveStats.volume24h, 3)} zkLTC`} />
            <Stat label="Virtual Liquidity" value={`${fmtLtc(ltcRaised as bigint, 3)} zkLTC`} />
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span className="flex items-center gap-2">
                Graduation progress
                {graduated && <span className="badge badge-success text-[9px]">DONE</span>}
              </span>
              <span className="font-mono">{formatPct(pct)} <span className="text-zinc-600">/ 100%</span></span>
            </div>
            <div className="relative h-3 rounded-full bg-bg-soft overflow-hidden border border-bg-border">
              <div
                className="h-full bg-gradient-to-r from-accent/70 via-accent to-accent shadow-[0_0_12px_rgba(163,255,18,0.6)] transition-[width] duration-700 ease-out"
                style={{ width: `${pctBarWidth(pct)}%`, minWidth: pct > 0 ? "6px" : "0px" }}
              />
              {[25, 50, 75].map((m) => (
                <div
                  key={m}
                  className="absolute top-0 bottom-0 w-px bg-bg-border/80"
                  style={{ left: `${m}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1 font-mono">
              <span>0 zkLTC</span>
              <span>{fmtLtc(ltcRaised as bigint, 4)} raised</span>
              <span>85 zkLTC</span>
            </div>
          </div>
        </div>

        <PriceChart curve={t.curve} symbol={t.symbol} />

        <TradesTable curve={t.curve} symbol={t.symbol} />

        <TokenComments token={t.token} />
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
        {graduated ? (
          <DexSwapWidget token={t.token} symbol={t.symbol} />
        ) : (
          <TradeWidget curve={t.curve} token={t.token} symbol={t.symbol} graduated={!!graduated} />
        )}
        <MigrationCard
          curve={t.curve}
          graduated={!!graduated}
          migrated={!!migrated}
          lpPair={lpPair as string | undefined}
        />
        <div className="card p-4 text-xs text-zinc-500 space-y-2">
          <div className="flex justify-between"><span>Token</span><span className="font-mono text-zinc-300">{shortAddr(t.token)}</span></div>
          <div className="flex justify-between"><span>Curve</span><span className="font-mono text-zinc-300">{shortAddr(t.curve)}</span></div>
          <div className="flex justify-between"><span>Circulating</span><span className="text-zinc-300">{fmtTokens(totalSupply as bigint)}</span></div>
          <div className="flex justify-between"><span>Max supply</span><span className="text-zinc-300">1B</span></div>
          <Link href="/" className="btn btn-ghost w-full mt-2">← Back to explore</Link>
        </div>

        <HolderDistribution token={t.token} curve={t.curve} creator={t.creator} />
      </div>
    </div>
  );
}

function formatPct(pct: number): string {
  if (!isFinite(pct) || pct <= 0) return "0%";
  if (pct >= 100) return "100%";
  if (pct >= 1) return pct.toFixed(2) + "%";
  if (pct >= 0.01) return pct.toFixed(3) + "%";
  return "<0.01%";
}

function pctBarWidth(pct: number): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return 100;
  return pct;
}

function Stat({ label, value, valueClassName = "text-zinc-100" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl bg-bg-soft border border-bg-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-sm truncate ${valueClassName}`}>{value}</div>
    </div>
  );
}

type Trade = {
  who: Address;
  kind: "buy" | "sell";
  ltc: bigint;
  tokens: bigint;
  ts: number;
  tx: `0x${string}`;
};

function TradesTable({ curve, symbol }: { curve: Address; symbol: string }) {
  const { data } = useTrades(curve, 200);
  const trades: Trade[] = (data?.trades ?? []).slice(0, 50).map((t) => ({
    who:    t.who as Address,
    kind:   t.kind,
    ltc:    BigInt(t.ltc),
    tokens: BigInt(t.tokens),
    ts:     t.ts,
    tx:     t.txHash,
  }));

  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-bg-border text-sm font-semibold">Recent trades</div>
      {trades.length === 0 ? (
        <div className="px-5 py-8 text-center text-zinc-500 text-sm">No trades yet.</div>
      ) : (
        <div className="divide-y divide-bg-border max-h-96 overflow-auto">
          {trades.map((tr) => (
            <a
              key={tr.tx + tr.kind}
              href={`${liteForge.blockExplorers.default.url}/tx/${tr.tx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 flex items-center justify-between text-xs hover:bg-bg-soft"
            >
              <div className="flex items-center gap-3">
                <span className={`badge ${tr.kind === "buy" ? "badge-success" : ""}`} style={tr.kind === "sell" ? { color: "#ff3b6b", borderColor: "#3a0a10", background: "#21070d" } : undefined}>
                  {tr.kind.toUpperCase()}
                </span>
                <span className="font-mono text-zinc-400">{shortAddr(tr.who)}</span>
              </div>
              <div className="flex items-center gap-4 font-mono">
                <span>{fmtLtc(tr.ltc, 4)} zkLTC</span>
                <span className="text-zinc-500">{fmtTokens(tr.tokens)} {symbol}</span>
                <span className="text-zinc-600">{new Date(tr.ts * 1000).toLocaleTimeString()}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
