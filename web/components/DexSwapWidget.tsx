"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseEther, parseUnits, type Address } from "viem";
import {
  DEX_ROUTER_ABI,
  DEX_FACTORY_ABI,
  DEX_PAIR_ABI,
  ERC20_ABI,
  ERC20_APPROVE_ABI,
} from "@/lib/abi";
import { DEX_ROUTER, DEX_FACTORY, WLTC_ADDRESS, isDexConfigured } from "@/lib/contracts";
import { fmtTokens, fmtLtc } from "@/lib/format";
import { ArrowDownUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Mode = "buy" | "sell";

const TRADE_DEADLINE_SECS = 600;
const HIGH_IMPACT_PCT     = 5;
const BLOCK_IMPACT_PCT    = 25;
const MAX_UINT256         = (1n << 256n) - 1n;

/**
 * Swap widget for graduated tokens. Trades against the LitPump DEX (UniV2 fork).
 *
 * - Buy: zkLTC → token (router wraps to WLTC, swaps via the pair, sends tokens to user)
 * - Sell: token → zkLTC (user approves once, router moves tokens, unwraps WLTC, sends ETH back)
 *
 * Reads pair reserves directly so we can compute price impact and minOut without
 * round-trips. Auto-handles approval the first time the user sells.
 */
export function DexSwapWidget({
  token,
  symbol,
}: {
  token: Address;
  symbol: string;
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
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  // Resolve the pair (token <-> WLTC) once.
  const { data: pairAddr } = useReadContract({
    address: DEX_FACTORY,
    abi: DEX_FACTORY_ABI,
    functionName: "getPair",
    args: [token, WLTC_ADDRESS],
    query: { enabled: isDexConfigured, refetchInterval: 30_000 },
  });

  // Read reserves + which side is token0 to compute impact.
  const { data: reserves } = useReadContract({
    address: pairAddr as Address | undefined,
    abi: DEX_PAIR_ABI,
    functionName: "getReserves",
    query: { enabled: !!pairAddr && pairAddr !== "0x0000000000000000000000000000000000000000", refetchInterval: 5_000 },
  });
  const tokenIs0 = token.toLowerCase() < WLTC_ADDRESS.toLowerCase();

  // Token-side and WLTC-side reserves in human-friendly form.
  const { reserveToken, reserveLTC } = useMemo(() => {
    const r = reserves as readonly [bigint, bigint] | undefined;
    if (!r) return { reserveToken: 0n, reserveLTC: 0n };
    return tokenIs0
      ? { reserveToken: r[0], reserveLTC: r[1] }
      : { reserveToken: r[1], reserveLTC: r[0] };
  }, [reserves, tokenIs0]);

  const parsedIn = useMemo(() => {
    if (!amount) return 0n;
    try {
      return mode === "buy" ? parseEther(amount) : parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount, mode]);

  // Quote out via the router's pure helper so it always matches on-chain math.
  const { data: quote } = useReadContract({
    address: DEX_ROUTER,
    abi: DEX_ROUTER_ABI,
    functionName: "getAmountOut",
    args: parsedIn > 0n
      ? mode === "buy"
        ? [parsedIn, reserveLTC, reserveToken]
        : [parsedIn, reserveToken, reserveLTC]
      : undefined,
    query: { enabled: parsedIn > 0n && reserveToken > 0n && reserveLTC > 0n, refetchInterval: 5_000 },
  });
  const outAmount = (quote as bigint | undefined) ?? 0n;

  const minOut = useMemo(() => {
    if (outAmount === 0n) return 0n;
    const bps = BigInt(Math.floor((100 - slippagePct) * 100));
    return (outAmount * bps) / 10_000n;
  }, [outAmount, slippagePct]);

  // Price-impact: spot mid-price vs effective execution price.
  const impactPct = useMemo(() => {
    if (parsedIn === 0n || outAmount === 0n || reserveToken === 0n || reserveLTC === 0n) return 0;
    const spotLtcPerToken = Number(reserveLTC) / Number(reserveToken);
    if (mode === "buy") {
      const ltcIn = Number(formatUnits(parsedIn, 18));
      const out   = Number(formatUnits(outAmount, 18));
      const eff   = ltcIn / out;                  // zkLTC paid per token
      return ((eff - spotLtcPerToken) / spotLtcPerToken) * 100;
    } else {
      const tokIn = Number(formatUnits(parsedIn, 18));
      const out   = Number(formatUnits(outAmount, 18));
      const eff   = out / tokIn;
      return ((spotLtcPerToken - eff) / spotLtcPerToken) * 100;
    }
  }, [parsedIn, outAmount, reserveToken, reserveLTC, mode]);

  const impactSeverity: "low" | "high" | "block" =
    impactPct >= BLOCK_IMPACT_PCT ? "block" :
    impactPct >= HIGH_IMPACT_PCT  ? "high"  : "low";

  // Allowance check for sell.
  const { data: allowance } = useReadContract({
    address: token,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: address ? [address, DEX_ROUTER] : undefined,
    query: { enabled: !!address && mode === "sell", refetchInterval: 6_000 },
  });
  const needsApproval = mode === "sell" && parsedIn > 0n && (allowance as bigint | undefined ?? 0n) < parsedIn;

  // Tx state.
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (isSuccess) {
      toast.success(mode === "buy" ? "Swapped!" : "Sold!");
      setAmount("");
      setHash(undefined);
    }
  }, [isSuccess, mode]);

  async function approve() {
    try {
      const h = await writeContractAsync({
        address: token,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [DEX_ROUTER, MAX_UINT256],
      });
      setHash(h);
      toast.success("Approval submitted");
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Approval failed");
    }
  }

  async function submit() {
    if (parsedIn === 0n) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + TRADE_DEADLINE_SECS);
    try {
      if (mode === "buy") {
        const h = await writeContractAsync({
          address: DEX_ROUTER,
          abi: DEX_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [minOut, [WLTC_ADDRESS, token], address!, deadline],
          value: parsedIn,
        });
        setHash(h);
      } else {
        const h = await writeContractAsync({
          address: DEX_ROUTER,
          abi: DEX_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [parsedIn, minOut, [token, WLTC_ADDRESS], address!, deadline],
        });
        setHash(h);
      }
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Tx failed");
    }
  }

  if (!isDexConfigured) {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        DEX router not configured — cannot trade graduated tokens yet.
      </div>
    );
  }

  if (!pairAddr || pairAddr === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        Liquidity pool not yet seeded for this token.
      </div>
    );
  }

  const busy = isPending || mining;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          DEX Swap <span className="badge badge-success text-[9px]">Graduated</span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          0.30% fee
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setMode("buy")}  className={`flex-1 btn ${mode === "buy"  ? "btn-primary" : "btn-ghost"}`}>Buy</button>
        <button onClick={() => setMode("sell")} className={`flex-1 btn ${mode === "sell" ? "btn-danger"  : "btn-ghost"}`}>Sell</button>
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
      </div>

      <div className="flex justify-center -my-2">
        <div className="w-8 h-8 rounded-lg bg-bg-soft border border-bg-border flex items-center justify-center">
          <ArrowDownUp size={14} className="text-zinc-500" />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
          <span>You receive (est.)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="input flex-1 text-lg font-mono text-zinc-400">
            {mode === "buy" ? fmtTokens(outAmount) : fmtLtc(outAmount, 6)}
          </div>
          <div className="px-3 py-2 rounded-lg bg-bg-soft border border-bg-border text-sm font-semibold min-w-[80px] text-center">
            {mode === "buy" ? symbol : "zkLTC"}
          </div>
        </div>

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

      {needsApproval ? (
        <button
          onClick={approve}
          disabled={!isConnected || busy}
          className="btn btn-primary w-full"
        >
          {busy ? "Approving…" : `Approve ${symbol}`}
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!isConnected || busy || parsedIn === 0n || impactSeverity === "block"}
          className={`btn w-full ${mode === "buy" ? "btn-primary" : "btn-danger"}`}
        >
          {!isConnected
            ? "Connect wallet"
            : impactSeverity === "block"
            ? `Price impact too high (${impactPct.toFixed(1)}%)`
            : busy
            ? "Confirming…"
            : mode === "buy"
            ? `Swap zkLTC for ${symbol}`
            : `Swap ${symbol} for zkLTC`}
        </button>
      )}
    </div>
  );
}
