"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { CURVE_ABI } from "@/lib/abi";
import { Camera, Expand, RotateCcw, Settings, SlidersHorizontal } from "lucide-react";

type TradePoint = { ts: number; price: number; volume: number; kind: "buy" | "sell" };
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type TFKey = "1m" | "5m" | "30m" | "1h" | "6h" | "D";

const BUCKETS: Record<TFKey, number> = {
  "1m": 60,
  "5m": 300,
  "30m": 1800,
  "1h": 3600,
  "6h": 21600,
  D: 86400,
};

const COLORS = {
  bg: "#0a0d12",
  grid: "rgba(255,255,255,0.05)",
  text: "#8b93a3",
  up: "#22c55e",
  down: "#ef4444",
  upFill: "#16a34a",
  downFill: "#0a0d12",
  accent: "#22c55e",
};

export function PriceChart({ curve }: { curve: Address }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<TradePoint[]>([]);
  const [tf, setTf] = useState<TFKey>("5m");
  const [loading, setLoading] = useState(true);

  const { data: currentPrice } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: "currentPriceX1e18",
    query: { refetchInterval: 5_000 },
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trades/${curve}?limit=200`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const items = (data.trades ?? []) as Array<any>;
        const out: TradePoint[] = items.map((t) => ({
          ts: t.ts,
          price: Number(formatUnits(BigInt(t.priceX1e18), 18)),
          volume: Number(formatUnits(BigInt(t.ltc), 18)),
          kind: t.kind,
        }));
        out.sort((a, b) => a.ts - b.ts);
        setTrades(out);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [curve]);

  const candles = useMemo(() => buildCandles(trades, BUCKETS[tf]), [trades, tf]);

  const W = 1100;
  const H = 360;
  const LEFT = 12;
  const RIGHT = 78;
  const TOP = 12;
  const BOTTOM = 28;
  const VOL_H = 60;
  const PRICE_VOL_GAP = 8;
  const plotW = W - LEFT - RIGHT;
  const priceH = H - TOP - BOTTOM - VOL_H - PRICE_VOL_GAP;
  const volumeTop = TOP + priceH + PRICE_VOL_GAP;
  const prices = candles.flatMap((c) => [c.high, c.low]).filter((v) => Number.isFinite(v) && v > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((maxPrice - minPrice) * 0.5, maxPrice * 0.003, 1e-12);
  const lo = Math.max(0, minPrice - pad);
  const hi = maxPrice + pad;
  const span = Math.max(1e-18, hi - lo);
  const maxVol = Math.max(...candles.map((c) => c.volume), 1e-9);
  const slot = plotW / Math.max(candles.length, 10);
  const bodyW = Math.max(6, Math.min(14, slot * 0.6));

  const xFor = (i: number) => LEFT + slot * i + slot / 2;
  const yFor = (p: number) => TOP + (1 - (p - lo) / span) * priceH;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

  const yLabels = Array.from({ length: 6 }, (_, i) => {
    const p = hi - (span / 5) * i;
    return { y: TOP + (priceH / 5) * i, price: p };
  });

  return (
    <div ref={wrapperRef} className="card somnex-card overflow-hidden" style={{ background: COLORS.bg }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-1 text-[11px]">
          {(Object.keys(BUCKETS) as TFKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setTf(k)}
              className={`px-2.5 py-1 rounded font-medium transition ${tf === k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"}`}
            >
              {k}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button className="px-2 py-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5" type="button"><SlidersHorizontal size={13} /></button>
          <button className="px-2 py-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5" type="button">Indicators</button>
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button"><RotateCcw size={14} /></button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button"><Settings size={14} /></button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button" onClick={() => wrapperRef.current?.requestFullscreen?.()}><Expand size={14} /></button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button"><Camera size={14} /></button>
        </div>
      </div>

      <div className="px-3 pt-2 pb-1 text-[11px] font-mono flex items-center gap-3" style={{ color: COLORS.text }}>
        <span className="text-zinc-200 font-semibold">LITPUMP - {tf}</span>
        {last ? (
          <div className="flex items-center gap-3">
            <span>O <span className="text-zinc-100">{formatPrice(last.open)}</span></span>
            <span>H <span className="text-zinc-100">{formatPrice(last.high)}</span></span>
            <span>L <span className="text-zinc-100">{formatPrice(last.low)}</span></span>
            <span>C <span className="text-zinc-100">{formatPrice(last.close)}</span></span>
            <span style={{ color: change >= 0 ? COLORS.up : COLORS.down }}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
          </div>
        ) : loading ? <span>Loading...</span> : (
          <span>
            No trades yet
            {currentPrice ? <span className="ml-2 text-zinc-300">- current price {formatPrice(Number(formatUnits(currentPrice as bigint, 18)))}</span> : null}
          </span>
        )}
      </div>

      <div className="w-full" style={{ height: 360, background: COLORS.bg, position: "relative" }}>
        {!loading && trades.length > 0 && trades.length < 3 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-bg-soft/80 border border-bg-border text-[11px] text-zinc-400 backdrop-blur-sm pointer-events-none">
            Just launched - {trades.length === 1 ? "1 trade so far" : `${trades.length} trades so far`}
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block" preserveAspectRatio="none">
          {yLabels.map(({ y, price }, i) => (
            <g key={`hl-${i}`}>
              <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke={COLORS.grid} vectorEffect="non-scaling-stroke" />
              <text x={W - RIGHT + 6} y={y + 3.5} fill={COLORS.text} fontSize="10.5" fontFamily="ui-monospace, monospace">{formatPrice(price)}</text>
            </g>
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const x = LEFT + (plotW / 5) * i;
            return <line key={`vl-${i}`} x1={x} x2={x} y1={TOP} y2={TOP + priceH} stroke={COLORS.grid} vectorEffect="non-scaling-stroke" />;
          })}

          <line x1={LEFT} x2={W - RIGHT} y1={volumeTop - 4} y2={volumeTop - 4} stroke="rgba(255,255,255,0.08)" vectorEffect="non-scaling-stroke" />

          {candles.map((c, i) => {
            const x = xFor(i);
            const up = c.close >= c.open;
            const color = up ? COLORS.up : COLORS.down;
            const yOpen = yFor(c.open);
            const yClose = yFor(c.close);
            const yHigh = yFor(c.high);
            const yLow = yFor(c.low);
            const top = Math.min(yOpen, yClose);
            const bottom = Math.max(yOpen, yClose);
            const height = Math.max(2, bottom - top);
            const volH = c.volume > 0 ? Math.max(2, (c.volume / maxVol) * (VOL_H - 6)) : 0;

            return (
              <g key={`${c.time}-${i}`}>
                {volH > 0 && (
                  <rect x={x - bodyW / 2} y={volumeTop + VOL_H - volH} width={bodyW} height={volH} fill={up ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)"} rx="0.5" />
                )}
                <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                <rect x={x - bodyW / 2} y={top} width={bodyW} height={height} fill={up ? COLORS.up : COLORS.bg} stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

          {last && (() => {
            const y = yFor(last.close);
            const color = last.close >= last.open ? COLORS.up : COLORS.down;
            return (
              <g>
                <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke={color} strokeOpacity="0.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                <rect x={W - RIGHT + 2} y={y - 9} width="72" height="18" rx="3" fill={color} />
                <text x={W - RIGHT + 38} y={y + 4} textAnchor="middle" fill={COLORS.bg} fontSize="10.5" fontFamily="ui-monospace, monospace" fontWeight="700">{formatPrice(last.close)}</text>
              </g>
            );
          })()}

          {candles.length > 0 && (() => {
            const ticks = Math.min(5, candles.length);
            const step = Math.max(1, Math.floor(candles.length / ticks));
            return Array.from({ length: ticks }, (_, i) => {
              const idx = Math.min(candles.length - 1, i * step);
              const c = candles[idx];
              if (!c) return null;
              return (
                <text key={`tt-${i}`} x={xFor(idx)} y={H - 10} textAnchor="middle" fill={COLORS.text} fontSize="10.5" fontFamily="ui-monospace, monospace">
                  {formatTime(c.time)}
                </text>
              );
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

function buildCandles(trades: TradePoint[], bucket: number): Candle[] {
  if (trades.length === 0) return [];

  const map = new Map<number, Candle>();
  for (const t of trades) {
    const time = Math.floor(t.ts / bucket) * bucket;
    const c = map.get(time);
    if (!c) {
      map.set(time, { time, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.volume });
    } else {
      c.high = Math.max(c.high, t.price);
      c.low = Math.min(c.low, t.price);
      c.close = t.price;
      c.volume += t.volume;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.time - b.time)
    .map((c) => {
      if (c.high === c.low) {
        const move = Math.max(c.high * 0.001, 1e-12);
        return { ...c, high: c.high + move, low: Math.max(0, c.low - move) };
      }
      return c;
    });
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  if (p >= 1e-6) return p.toFixed(10);
  const fixed = p.toFixed(18);
  const m = fixed.match(/^(0\.0*)(\d{1,4})/);
  return m ? m[1] + m[2] : fixed;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
