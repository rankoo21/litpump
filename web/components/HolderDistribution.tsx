"use client";

import { useEffect, useState } from "react";
import { type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { Crown, Wrench } from "lucide-react";

type Holder = { address: Address; balance: bigint };

// LitPump contracts mint up to a fixed cap of 1,000,000,000 tokens. Holder
// percentages should be measured against this cap (Pump.fun's convention),
// not against the running circulating supply — otherwise an early buyer with
// 0.001 zkLTC would appear to own "100% of supply" while the curve still has
// hundreds of millions to distribute.
const TOTAL_CAP = 1_000_000_000n * 10n ** 18n;

/**
 * Top-holder list for a token. Reads pre-aggregated balances from the local
 * indexer (replays Transfer events into a SQLite table once and keeps the running
 * totals fresh on each tick), so this component is now O(1) per render.
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
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/holders/${token}?limit=12`);
        const data = await res.json();
        if (cancelled) return;
        const items = (data.holders ?? []) as Array<{ address: string; balance: string }>;
        setHolders(
          items.map((h) => ({ address: h.address as Address, balance: BigInt(h.balance) }))
        );
      } catch {
        /* swallow — empty list will surface */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 12_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  // The bonding curve manages unsold supply via virtual reserves and never
  // shows up on the indexer's holder list. Synthesise a row for it equal to
  // the gap between the fixed cap and the sum of detected holders so the
  // distribution sums to 100% of total supply.
  const detected    = holders.reduce((acc, h) => acc + h.balance, 0n);
  const curveSupply = TOTAL_CAP > detected ? TOTAL_CAP - detected : 0n;
  const allRows: Holder[] = curveSupply > 0n
    ? [{ address: curve, balance: curveSupply }, ...holders].sort((a, b) =>
        a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1
      )
    : holders;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
        <div className="text-sm font-semibold">Holder Distribution</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          Top {Math.min(allRows.length, 12) || 0}
        </div>
      </div>

      {loading && holders.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-500 text-xs">Loading holders…</div>
      ) : allRows.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-500 text-xs">No holders yet.</div>
      ) : (
        <div className="divide-y divide-bg-border">
          {allRows.map((h) => {
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
  if (a === ctx.curve.toLowerCase()) {
    return {
      label: "Bonding curve",
      icon: <Wrench size={9} />,
      style: { color: "#a3ff12", borderColor: "#2a3a10", background: "#16210a" },
    };
  }
  if (a === ctx.creator.toLowerCase()) {
    return {
      label: "Dev",
      icon: <Crown size={9} />,
      style: { color: "#facc15", borderColor: "#3a330a", background: "#21200a" },
    };
  }
  return null;
}
