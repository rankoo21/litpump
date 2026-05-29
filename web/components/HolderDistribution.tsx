"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useTrades } from "@/lib/useTrades";
import { useDirectTrades } from "@/lib/useDirectTrades";
import { mergeTrades } from "@/lib/mergeTrades";
import { Crown } from "lucide-react";

type Holder = { address: Address; balance: bigint };

// LitPump contracts mint up to a fixed cap of 1,000,000,000 tokens. Holder
// percentages are measured against this cap (pump.fun's convention) so an
// early buyer with 0.05 zkLTC reads as a small fraction of total supply, not
// "100% of supply".
const TOTAL_CAP = 1_000_000_000n * 10n ** 18n;

/**
 * Top-holder list for a token.
 *
 * Balances are reconstructed live from the same trades feed the chart and
 * recent-trades table use (server indexer + direct RPC + WebSocket, merged).
 * Every buy adds to the trader's balance, every sell subtracts. This means
 * holders update the instant a trade lands — in every open browser — without
 * waiting for a server-side balance rebuild.
 */
export function HolderDistribution({
  token,
  curve,
  creator,
}: {
  token: Address;
  curve: Address;
  creator: Address;
}) {
  const { data, isLoading } = useTrades(curve, 200);
  const direct = useDirectTrades(curve, token, "");
  const trades = mergeTrades(data?.trades, direct ?? undefined);

  const holders = useMemo<Holder[]>(() => {
    const bal = new Map<string, bigint>();
    // Replay oldest → newest so running balances are correct.
    const ordered = [...trades].sort((a, b) => a.ts - b.ts);
    for (const t of ordered) {
      const who    = t.who.toLowerCase();
      const tokens = BigInt(t.tokens);
      const prev   = bal.get(who) ?? 0n;
      bal.set(who, t.kind === "buy" ? prev + tokens : prev - tokens);
    }
    const rows: Holder[] = [];
    for (const [addr, b] of bal) {
      if (b > 0n) rows.push({ address: addr as Address, balance: b });
    }
    rows.sort((a, b) => (a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1));
    return rows.slice(0, 12);
  }, [trades]);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <div className="text-sm font-semibold">Holder Distribution</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          Top {holders.length || 0}
        </div>
      </div>

      {isLoading && holders.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-500 text-xs">Loading holders…</div>
      ) : holders.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-500 text-xs">No holders yet.</div>
      ) : (
        <div className="divide-y divide-bg-border">
          {holders.map((h) => {
            const pct = TOTAL_CAP > 0n ? Number((h.balance * 10_000n) / TOTAL_CAP) / 100 : 0;
            const tag = labelFor(h.address, { curve, creator });
            return (
              <a
                key={h.address}
                href={`${liteForge.blockExplorers.default.url}/address/${h.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 flex items-center justify-between text-xs hover:bg-bg-soft"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-zinc-300 truncate">
                    {shortAddr(h.address)}
                  </span>
                  {tag && (
                    <span className="badge text-[9px]" style={tag.style}>
                      {tag.icon}
                      {tag.label}
                    </span>
                  )}
                </div>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {pct >= 0.01 ? pct.toFixed(2) : "<0.01"}%
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelFor(
  addr: Address,
  ctx: { curve: Address; creator: Address }
): { label: string; icon: React.ReactNode; style: React.CSSProperties } | null {
  const a = addr.toLowerCase();
  if (a === ctx.creator.toLowerCase()) {
    return {
      label: "Dev",
      icon: <Crown size={9} />,
      style: { color: "#facc15", borderColor: "#3a330a", background: "#21200a" },
    };
  }
  return null;
}
