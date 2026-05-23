"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { CURVE_ABI, ERC20_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, isFactoryConfigured } from "@/lib/contracts";
import { fmtLtc, fmtTokens, shortAddr } from "@/lib/format";
import { TokenImage } from "@/components/TokenImage";
import type { TokenItem } from "@/components/TokenCard";
import { Briefcase, Rocket, Wallet } from "lucide-react";
import type { Address } from "viem";

/**
 * Portfolio page: shows tokens the connected wallet currently holds (with
 * implied-value in zkLTC at the live curve price), plus tokens it created.
 *
 * Implementation note: we read every token's balance and price in parallel via
 * `useReadContracts` (single multicall round). For very large factories this
 * should be replaced with an indexer, but at testnet scale this is fine.
 */
export default function PortfolioPage() {
  const { address, isConnected } = useAccount();

  const { data: list } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "listTokens",
    args: [0n, 100n],
    query: { enabled: isFactoryConfigured, refetchInterval: 12_000 },
  });
  const tokens = useMemo(() => (list as TokenItem[] | undefined) ?? [], [list]);

  const reads = useReadContracts({
    contracts: address && tokens.length > 0
      ? tokens.flatMap((t) => [
          { address: t.token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] } as const,
          { address: t.curve, abi: CURVE_ABI, functionName: "currentPriceX1e18" } as const,
          { address: t.curve, abi: CURVE_ABI, functionName: "graduated" } as const,
        ])
      : [],
    query: { enabled: !!address && tokens.length > 0, refetchInterval: 8_000 },
  });

  const enriched = useMemo(() => {
    if (!address) return [];
    return tokens.map((t, i) => {
      const balance   = (reads.data?.[i * 3]?.result as bigint | undefined)     ?? 0n;
      const priceX18  = (reads.data?.[i * 3 + 1]?.result as bigint | undefined) ?? 0n;
      const graduated = !!(reads.data?.[i * 3 + 2]?.result as boolean | undefined);
      // value = balance * price / 1e18 (both are 1e18-scaled).
      const valueLtc  = (balance * priceX18) / 10n ** 18n;
      const isCreator = t.creator.toLowerCase() === address.toLowerCase();
      return { t, balance, priceX18, valueLtc, graduated, isCreator };
    });
  }, [tokens, reads.data, address]);

  const held = enriched.filter((x) => x.balance > 0n);
  const launched = enriched.filter((x) => x.isCreator);
  const totalValue = held.reduce((acc, x) => acc + x.valueLtc, 0n);

  if (!isConnected) {
    return (
      <div className="card p-12 text-center max-w-md mx-auto">
        <Wallet className="mx-auto text-zinc-600 mb-3" size={32} />
        <div className="text-lg font-semibold">Connect your wallet</div>
        <div className="text-sm text-zinc-500 mt-1">
          Sign in to see the tokens you hold and the ones you've launched.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase size={20} /> My portfolio
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Holdings priced live at curve spot price. Past performance is not indicative
            of future returns.
          </p>
        </div>
        <Link href="/" className="btn btn-ghost">← Explore</Link>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryCard label="Holdings value (live)" value={`${fmtLtc(totalValue, 4)} zkLTC`} />
        <SummaryCard label="Tokens held" value={`${held.length}`} />
        <SummaryCard label="Tokens launched" value={`${launched.length}`} />
      </div>

      {/* Held tokens */}
      <Section title="Holdings" empty="You don't hold any LitPump tokens yet.">
        {held.length === 0 ? null : (
          <div className="card overflow-hidden">
            <Header3
              cols={["Token", "Balance", "Price", "Value", ""]}
            />
            {held.map(({ t, balance, priceX18, valueLtc, graduated }) => (
              <Link
                key={t.token}
                href={`/token/${t.token}`}
                className="grid grid-cols-[1fr_120px_120px_120px_60px] gap-3 items-center px-4 py-3 border-b border-bg-border/60 hover:bg-white/[0.025] transition"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <TokenImage src={t.imageURI} symbol={t.symbol} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{t.name}</span>
                    <span className="block text-xs text-zinc-500 truncate">${t.symbol}</span>
                  </span>
                </span>
                <span className="font-mono text-xs text-zinc-200">{fmtTokens(balance)}</span>
                <span className="font-mono text-xs text-zinc-300">
                  {fmtPriceX18(priceX18)} zkLTC
                </span>
                <span className="font-mono text-sm text-accent">{fmtLtc(valueLtc, 4)}</span>
                <span className="text-right">
                  {graduated && <span className="badge badge-success text-[9px]">DONE</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Launched tokens */}
      <Section
        title="Launched by you"
        empty="You haven't launched any tokens yet."
        action={
          <Link href="/create" className="btn btn-primary">
            <Rocket size={14} /> Launch a new token
          </Link>
        }
      >
        {launched.length === 0 ? null : (
          <div className="card overflow-hidden">
            <Header3 cols={["Token", "Status", "Curve raised", "Action"]} />
            {launched.map(({ t, graduated }) => (
              <div
                key={t.token}
                className="grid grid-cols-[1fr_140px_140px_120px] gap-3 items-center px-4 py-3 border-b border-bg-border/60"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <TokenImage src={t.imageURI} symbol={t.symbol} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{t.name}</span>
                    <span className="block text-xs text-zinc-500 truncate">${t.symbol}</span>
                  </span>
                </span>
                <span>
                  {graduated ? (
                    <span className="badge badge-success">Graduated</span>
                  ) : (
                    <span className="badge">On curve</span>
                  )}
                </span>
                <span className="font-mono text-xs text-zinc-300">{shortAddr(t.token)}</span>
                <Link href={`/token/${t.token}`} className="btn btn-ghost text-xs justify-end">
                  Open →
                </Link>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-mono text-zinc-100">{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  action,
  children,
}: {
  title: string;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {action}
      </div>
      {children ?? (
        <div className="card p-8 text-center text-sm text-zinc-500">{empty}</div>
      )}
    </section>
  );
}

function Header3({ cols }: { cols: string[] }) {
  const tmpl = cols.map(() => "1fr").join(" ");
  return (
    <div
      className="grid gap-3 px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 border-b border-bg-border"
      style={{ gridTemplateColumns: tmpl }}
    >
      {cols.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

function fmtPriceX18(x: bigint): string {
  const n = Number(x) / 1e18;
  if (n === 0) return "0";
  if (n < 1e-6) return n.toExponential(2);
  if (n < 1) return n.toFixed(8);
  return n.toFixed(4);
}
