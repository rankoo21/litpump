"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseEther, parseUnits, type Address } from "viem";
import { CURVE_ABI, ERC20_ABI } from "@/lib/abi";
import { fmtTokens, fmtLtc } from "@/lib/format";
import { ArrowDownUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Mode = "buy" | "sell";

const TRADE_DEADLINE_SECS = 600; // 10 minutes
const HIGH_IMPACT_PCT     = 5;   // amber warning threshold
const BLOCK_IMPACT_PCT    = 25;  // hard-stop threshold

export function TradeWidget({
  curve,
  token,
  symbol,
  graduated,
}: {
  curve: Address;
  token: Address;
  symbol: string;
  graduated: boolean;
}) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [slippagePct, setSlippagePct] = useState(2);

  const { data: nativeBal } = useBalance({ address });
  const { data: tokBal } = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 4_000 },
  });

  const parsedIn = useMemo(() => {
    if (!amount) return 0n;
    try {
      return mode === "buy" ? parseEther(amount) : parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount, mode]);

  const { data: quote } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: mode === "buy" ? "quoteBuy" : "quoteSell",
    args: parsedIn > 0n ? [parsedIn] : undefined,
    query: { enabled: parsedIn > 0n, refetchInterval: 4_000 },
  });

  // quoteBuy returns (tokensOut, fee, ltcConsumed); quoteSell returns (ltcOut, fee).
  const outAmount = (quote as readonly bigint[] | undefined)?.[0] ?? 0n;
  const feeAmount = (quote as readonly bigint[] | undefined)?.[1] ?? 0n;

  // Read the live spot price for impact calculation.
  const { data: spotPriceX1e18 } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: "currentPriceX1e18",
    query: { refetchInterval: 6_000 },
  });

  /// Price impact = how much the average execution price differs from the spot price.
  /// For a buy:  effectivePrice = ltcIn / tokensOut
  /// For a sell: effectivePrice = ltcOut / tokensIn (after fee)
  /// impact% = (effective - spot) / spot   [buy: positive means worse for the trader]
  const impactPct = useMemo(() => {
    if (parsedIn === 0n || outAmount === 0n) return 0;
    if (!spotPriceX1e18) return 0;
    const spot = Number(formatUnits(spotPriceX1e18 as bigint, 18));
    if (spot <= 0) return 0;
    let effective = 0;
    if (mode === "buy") {
      // ltcIn (in zkLTC) / tokensOut (in tokens) = price the user is paying.
      const ltcIn = Number(formatUnits(parsedIn, 18));
      const out   = Number(formatUnits(outAmount, 18));
      effective = ltcIn / out;
      return ((effective - spot) / spot) * 100;
    } else {
      const tokIn = Number(formatUnits(parsedIn, 18));
      const out   = Number(formatUnits(outAmount, 18));
      effective = out / tokIn;
      // Sell: lower received price = bigger impact, so we flip the sign.
      return ((spot - effective) / spot) * 100;
    }
  }, [parsedIn, outAmount, spotPriceX1e18, mode]);

  const impactSeverity: "low" | "high" | "block" =
    impactPct >= BLOCK_IMPACT_PCT ? "block" :
    impactPct >= HIGH_IMPACT_PCT  ? "high"  : "low";

  const minOut = useMemo(() => {
    if (outAmount === 0n) return 0n;
    const bps = BigInt(Math.floor((100 - slippagePct) * 100));
    return (outAmount * bps) / 10_000n;
  }, [outAmount, slippagePct]);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      toast.success(mode === "buy" ? "Bought!" : "Sold!");
      setAmount("");
      setHash(undefined);
    }
  }, [isSuccess, mode]);

  const submit = async () => {
    if (graduated) {
      toast.error("This token has graduated — curve is closed.");
      return;
    }
    if (parsedIn === 0n) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + TRADE_DEADLINE_SECS);
    try {
      if (mode === "buy") {
        const h = await writeContractAsync({
          address: curve,
          abi: CURVE_ABI,
          functionName: "buy",
          args: [minOut, deadline],
          value: parsedIn,
        });
        setHash(h);
      } else {
        const h = await writeContractAsync({
          address: curve,
          abi: CURVE_ABI,
          functionName: "sell",
          args: [parsedIn, minOut, deadline],
        });
        setHash(h);
      }
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Tx failed");
    }
  };

  const busy = isPending || isMining;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode("buy")}
          className={`flex-1 btn ${mode === "buy" ? "btn-primary" : "btn-ghost"}`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode("sell")}
          className={`flex-1 btn ${mode === "sell" ? "btn-danger" : "btn-ghost"}`}
        >
          Sell
        </button>
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
          <span>You pay</span>
          <span>
            Balance:{" "}
            <button
              className="hover:text-zinc-200"
              onClick={() => {
                if (mode === "buy" && nativeBal) {
                  // keep a bit for gas
                  const safe = nativeBal.value > parseEther("0.01") ? nativeBal.value - parseEther("0.01") : 0n;
                  setAmount(formatUnits(safe, 18));
                } else if (mode === "sell" && tokBal !== undefined) {
                  setAmount(formatUnits(tokBal as bigint, 18));
                }
              }}
            >
              {mode === "buy"
                ? `${nativeBal ? Number(formatUnits(nativeBal.value, 18)).toFixed(4) : "0"} zkLTC`
                : `${fmtTokens(tokBal as bigint)} ${symbol}`}
            </button>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input flex-1 text-lg font-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
          />
          <div className="px-3 py-2 rounded-lg bg-bg-soft border border-bg-border text-sm font-semibold min-w-[80px] text-center">
            {mode === "buy" ? "zkLTC" : symbol}
          </div>
        </div>

        <div className="flex gap-1.5 mt-2">
          {[
            { label: "25%", frac: 25n },
            { label: "50%", frac: 50n },
            { label: "MAX", frac: 100n },
          ].map(({ label, frac }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (mode === "buy" && nativeBal) {
                  const reserve = parseEther("0.01");
                  const spendable = nativeBal.value > reserve ? nativeBal.value - reserve : 0n;
                  const v = (spendable * frac) / 100n;
                  setAmount(formatUnits(v, 18));
                } else if (mode === "sell" && tokBal !== undefined) {
                  const v = ((tokBal as bigint) * frac) / 100n;
                  setAmount(formatUnits(v, 18));
                }
              }}
              className="flex-1 text-[11px] py-1.5 rounded-md bg-bg-soft border border-bg-border text-zinc-400 hover:text-accent hover:border-accent/40 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center -my-2">
        <div className="w-8 h-8 rounded-lg bg-bg-soft border border-bg-border flex items-center justify-center">
          <ArrowDownUp size={14} className="text-zinc-500" />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
          <span>You receive (est.)</span>
          <span>Fee: {fmtLtc(feeAmount, 6)} zkLTC</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="input flex-1 text-lg font-mono text-zinc-400">
            {mode === "buy" ? fmtTokens(outAmount) : fmtLtc(outAmount, 6)}
          </div>
          <div className="px-3 py-2 rounded-lg bg-bg-soft border border-bg-border text-sm font-semibold min-w-[80px] text-center">
            {mode === "buy" ? symbol : "zkLTC"}
          </div>
        </div>

        {/* Price impact display */}
        {parsedIn > 0n && impactPct > 0 && (
          <div
            className={`mt-2 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md border ${
              impactSeverity === "block"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                : impactSeverity === "high"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-bg-soft border-bg-border text-zinc-500"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {impactSeverity !== "low" && <AlertTriangle size={11} />}
              Price impact
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {impactPct < 0.01 ? "<0.01%" : `${impactPct.toFixed(2)}%`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">Slippage tolerance</span>
        <div className="flex gap-1">
          {[1, 2, 5, 10].map((p) => (
            <button
              key={p}
              onClick={() => setSlippagePct(p)}
              className={`px-2 py-1 rounded ${slippagePct === p ? "bg-accent text-bg" : "bg-bg-soft text-zinc-400"}`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!isConnected || busy || parsedIn === 0n || graduated || impactSeverity === "block"}
        className={`btn w-full ${mode === "buy" ? "btn-primary" : "btn-danger"}`}
      >
        {graduated
          ? "Graduated — trading closed"
          : !isConnected
          ? "Connect wallet"
          : impactSeverity === "block"
          ? `Price impact too high (${impactPct.toFixed(1)}%)`
          : busy
          ? "Confirming…"
          : mode === "buy"
          ? `Buy ${symbol}${impactSeverity === "high" ? " anyway" : ""}`
          : `Sell ${symbol}${impactSeverity === "high" ? " anyway" : ""}`}
      </button>
    </div>
  );
}
