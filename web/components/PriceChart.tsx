"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { CURVE_ABI } from "@/lib/abi";
import { useTrades } from "@/lib/useTrades";
import { Camera, Expand, RotateCcw, Settings } from "lucide-react";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type TFKey  = "1m" | "5m" | "30m" | "1h" | "6h" | "D";

const BUCKETS: Record<TFKey, number> = {
  "1m":  60,
  "5m":  300,
  "30m": 1800,
  "1h":  3600,
  "6h":  21600,
  D:     86400,
};

const COLORS = {
  bg:   "#0a0d12",
  text: "#8b93a3",
  up:   "#22c55e",
  down: "#ef4444",
};

// `lightweight-charts` v4 still exposes `addCandlestickSeries` etc. but the
// type checker (running against newer optional declarations) trips on those
// methods. We narrow to a permissive shape locally.
type ChartV4 = IChartApi & {
  addCandlestickSeries: (opts?: any) => ISeriesApi<"Candlestick">;
  addHistogramSeries:   (opts?: any) => ISeriesApi<"Histogram">;
};

export function PriceChart({ curve }: { curve: Address }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef   = useRef<HTMLDivElement>(null);
  const apiRef     = useRef<ChartV4 | null>(null);
  const candleRef  = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef  = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [tf, setTf] = useState<TFKey>("5m");

  const { data, isLoading } = useTrades(curve, 200);
  const trades = data?.trades ?? [];

  const { data: currentPrice } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: "currentPriceX1e18",
    query: { refetchInterval: 5_000 },
  });

  // Build chart once.
  useEffect(() => {
    if (!chartRef.current) return;
    const el = chartRef.current;

    const chart = createChart(el, {
      width:  el.clientWidth  || 900,
      height: el.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor:  COLORS.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: {
        borderColor:  "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.06, bottom: 0.28 },
      },
      timeScale: {
        borderColor:    "rgba(255,255,255,0.08)",
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    4,
        barSpacing:     8,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(139,147,163,0.3)", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#202632" },
        horzLine: { color: "rgba(139,147,163,0.3)", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#202632" },
      },
    }) as ChartV4;

    const candle = chart.addCandlestickSeries({
      upColor:         COLORS.up,
      downColor:       "#0a0d12",
      borderUpColor:   COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor:     COLORS.up,
      wickDownColor:   COLORS.down,
      priceFormat: { type: "price", precision: 12, minMove: 1e-12 },
    });

    const volume = chart.addHistogramSeries({
      priceFormat:  { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    apiRef.current    = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) chart.resize(w, h);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      apiRef.current    = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  const candles = useMemo(() => buildCandles(trades, BUCKETS[tf]), [trades, tf]);

  // Push series data on changes. `setData` is fine for re-rendering — the
  // expensive part is `fitContent()`, which resets the user's pan/zoom. We
  // call it only on the very first load and when the timeframe changes.
  // We also memoise the last-pushed candle list so we never push identical
  // data — that's what was making the chart visibly flicker on every poll.
  const fittedRef    = useRef<TFKey | null>(null);
  const lastSigRef   = useRef<string>("");
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !apiRef.current) return;
    if (candles.length === 0) return;

    // Cheap content signature — bail out when nothing changed.
    const last = candles[candles.length - 1];
    const sig  = `${candles.length}:${last.time}:${last.close}:${last.volume}`;
    if (sig === lastSigRef.current && fittedRef.current === tf) return;
    lastSigRef.current = sig;

    candleRef.current.setData(
      candles.map((c) => ({
        time:  c.time as UTCTimestamp,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }))
    );
    volumeRef.current.setData(
      candles.map((c) => ({
        time:  c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
      }))
    );

    // Bar spacing depends on density. Apply it once per timeframe so density
    // tweaks don't fight with the user's manual zoom.
    if (fittedRef.current !== tf) {
      const ts  = apiRef.current.timeScale();
      const len = candles.length;
      if (len <= 12)      ts.applyOptions({ barSpacing: 28 });
      else if (len <= 30) ts.applyOptions({ barSpacing: 14 });
      else                ts.applyOptions({ barSpacing: 8  });
      ts.fitContent();
      fittedRef.current = tf;
    }
  }, [candles, tf]);

  const last   = candles[candles.length - 1];
  const prev   = candles[candles.length - 2];
  const change = last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

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
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <button
            className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200"
            type="button"
            onClick={() => apiRef.current?.timeScale().fitContent()}
            aria-label="Reset zoom"
          >
            <RotateCcw size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button" aria-label="Settings"><Settings size={14} /></button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button" onClick={() => wrapperRef.current?.requestFullscreen?.()} aria-label="Fullscreen"><Expand size={14} /></button>
          <button className="p-1.5 rounded hover:bg-white/5 hover:text-zinc-200" type="button" aria-label="Screenshot"><Camera size={14} /></button>
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
        ) : isLoading ? (
          <span>Loading...</span>
        ) : (
          <span>
            No trades yet
            {currentPrice ? <span className="ml-2 text-zinc-300">- current price {formatPrice(Number(formatUnits(currentPrice as bigint, 18)))}</span> : null}
          </span>
        )}
      </div>

      <div ref={chartRef} className="w-full" style={{ height: 360, background: COLORS.bg }} />
    </div>
  );
}

function buildCandles(
  trades: Array<{ ts: number; priceX1e18: string; ltc: string }>,
  bucket: number
): Candle[] {
  if (trades.length === 0) return [];
  // Sort ascending so open/close honour event order.
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);

  // First pass — collect price extremes and trade volumes per bucket.
  type Agg = { time: number; high: number; low: number; close: number; volume: number };
  const map = new Map<number, Agg>();
  for (const t of sorted) {
    const time   = Math.floor(t.ts / bucket) * bucket;
    const price  = Number(formatUnits(BigInt(t.priceX1e18), 18));
    const volume = Number(formatUnits(BigInt(t.ltc), 18));
    const a      = map.get(time);
    if (!a) {
      map.set(time, { time, high: price, low: price, close: price, volume });
    } else {
      a.high   = Math.max(a.high, price);
      a.low    = Math.min(a.low,  price);
      a.close  = price;
      a.volume += volume;
    }
  }

  // Second pass — derive `open` from the previous bucket's close (standard
  // TradingView convention). This means a single-trade bucket whose price
  // ticked up since the last bucket renders as a real green body, instead of
  // a flat doji line.
  const ordered = Array.from(map.values()).sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  let prevClose = ordered[0].close; // first candle uses its own close as open (no history)
  for (const a of ordered) {
    out.push({
      time:   a.time,
      open:   prevClose,
      high:   Math.max(a.high, prevClose),
      low:    Math.min(a.low,  prevClose),
      close:  a.close,
      volume: a.volume,
    });
    prevClose = a.close;
  }
  return out;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  if (p >= 1e-6) return p.toFixed(10);
  const fixed = p.toFixed(18);
  const m     = fixed.match(/^(0\.0*)(\d{1,4})/);
  return m ? m[1] + m[2] : fixed;
}
