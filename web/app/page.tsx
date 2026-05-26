"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Rocket, Search, Star, ShieldCheck, Zap, TrendingUp, Coins } from "lucide-react";
import { TokenCard, type TokenItem } from "@/components/TokenCard";
import { LiveTicker } from "@/components/LiveTicker";
import { FeaturedToken } from "@/components/FeaturedToken";
import { fmtLtc } from "@/lib/format";
import { useWatchlist } from "@/lib/useWatchlist";
import { useFeed } from "@/lib/useFeed";
import type { FeedToken } from "@/lib/feed";
import { isFactoryConfigured } from "@/lib/contracts";

type SortKey = "new" | "trending" | "graduating" | "listed" | "watchlist";

/// Adapter: turn a serialised feed entry back into the structurally-typed
/// `TokenItem` used by the cards and ticker.
function asTokenItem(t: FeedToken): TokenItem {
  return {
    token: t.token,
    curve: t.curve,
    creator: t.creator,
    name: t.name,
    symbol: t.symbol,
    imageURI: t.imageURI,
    description: t.description,
    twitter: t.twitter,
    telegram: t.telegram,
    website: t.website,
    createdAt: BigInt(t.createdAt),
  };
}

export default function HomePage() {
  const { feed, loading, error } = useFeed();
  const tokens = feed?.tokens ?? [];

  // Featured selection (King of the Hill = closest to graduation, Trending = highest 24h volume).
  const king = useMemo(
    () => tokens.filter((t) => !t.graduated).sort((a, b) => b.graduationProgressPct - a.graduationProgressPct)[0],
    [tokens]
  );
  const trending = useMemo(
    () =>
      tokens
        .filter((t) => !t.graduated && t.token !== king?.token)
        .sort((a, b) => Number(BigInt(b.volume24h) - BigInt(a.volume24h)))[0],
    [tokens, king]
  );

  const [sort, setSort] = useState<SortKey>("new");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const watch = useWatchlist();

  // Reset to page 1 whenever filters change so users never see "page 5 of 0".
  useEffect(() => { setPage(1); }, [sort, search, watch.list.length]);

  const PAGE_SIZE = 24;

  const visible = useMemo(() => {
    let arr = tokens;
    if (sort === "graduating") arr = arr.filter((e) => !e.graduated);
    if (sort === "listed")     arr = arr.filter((e) => e.graduated);
    if (sort === "watchlist")  arr = arr.filter((e) => watch.has(e.token));

    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case "trending":
          // Real "trending": 24h volume, with txCount as a tie-break.
          {
            const av = BigInt(a.volume24h);
            const bv = BigInt(b.volume24h);
            if (av !== bv) return Number(bv - av);
            return b.txCount24h - a.txCount24h;
          }
        case "graduating":
          return b.graduationProgressPct - a.graduationProgressPct;
        case "listed":
        case "new":
        default:
          return b.createdAt - a.createdAt;
      }
    });

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.symbol.toLowerCase().includes(q) ||
          t.token.toLowerCase().includes(q)
      );
    }
    return arr;
  }, [tokens, sort, search, watch]);

  const totalPages  = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pageStart   = (safePage - 1) * PAGE_SIZE;
  const pageEnd     = pageStart + PAGE_SIZE;
  const visiblePage = visible.slice(pageStart, pageEnd);

  return (
    <div className="space-y-10">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-bg-border bg-bg-soft/60 bg-grid">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative px-6 sm:px-10 py-12 sm:py-16">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="badge badge-success">
              <ShieldCheck size={11} /> Anti-snipe + Creator share
            </span>
            <span className="badge">LiteForge testnet · chainId 4441</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl leading-[1.05]">
            Launch a memecoin on{" "}
            <span className="text-accent">LitVM</span>{" "}
            in one transaction.
          </h1>
          <p className="mt-4 text-zinc-400 max-w-2xl">
            Permissionless bonding curves on Litecoin's Layer 2. 50% of trading fees
            to creators, anti-snipe protection on the first blocks, and automatic
            graduation at 85 zkLTC.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/create" className="btn btn-primary">
              <Rocket size={16} /> Launch your token
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost">
              <TrendingUp size={14} /> View leaderboard
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl">
            <HeroStat
              icon={<Coins size={14} />}
              label="Tokens launched"
              value={loading && !feed ? "—" : (feed?.totals.tokens ?? 0).toString()}
            />
            <HeroStat
              icon={<TrendingUp size={14} />}
              label="Total market cap"
              value={`${fmtLtc(BigInt(feed?.totals.marketCap ?? "0"), 2)} zkLTC`}
            />
            <HeroStat
              icon={<Zap size={14} />}
              label="24h volume"
              value={`${fmtLtc(BigInt(feed?.totals.volume24h ?? "0"), 3)} zkLTC`}
            />
            <HeroStat
              icon={<ShieldCheck size={14} />}
              label="Graduated"
              value={(feed?.totals.graduated ?? 0).toString()}
            />
          </div>
        </div>
      </section>

      {/* Live trades ticker */}
      {tokens.length > 0 && (
        <div className="-mx-4 sm:-mx-6">
          <LiveTicker tokens={tokens.map(asTokenItem)} />
        </div>
      )}

      {/* Featured row */}
      {(king || trending) && (
        <section className="grid lg:grid-cols-2 gap-4">
          {king     && <FeaturedToken t={asTokenItem(king)}     variant="king" />}
          {trending && <FeaturedToken t={asTokenItem(trending)} variant="trending" />}
        </section>
      )}

      {/* Tabs + Search */}
      <section>
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
          <div className="flex items-center gap-1 p-1 rounded-full bg-bg-soft/60 border border-bg-border overflow-x-auto">
            {(
              [
                ["new",        "New"],
                ["trending",   "Trending"],
                ["graduating", "About to graduate"],
                ["listed",     "Graduated"],
                ["watchlist",  "Watchlist"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className="tab inline-flex items-center gap-1.5"
                data-active={sort === key}
                onClick={() => setSort(key)}
              >
                {key === "watchlist" && (
                  <Star size={11} fill={sort === key ? "currentColor" : "none"} />
                )}
                {label}
                {key === "watchlist" && watch.list.length > 0 && (
                  <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-bg-border text-zinc-300">
                    {watch.list.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <Search
                size={15}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none z-10"
              />
              <input
                type="search"
                className="input !pl-12"
                placeholder="Search by name, symbol, or address"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!isFactoryConfigured ? (
          <EmptyState
            title="Factory not configured"
            body="Set NEXT_PUBLIC_FACTORY_ADDRESS in web/.env.local after deploying the contracts."
          />
        ) : error ? (
          <EmptyState title="Couldn't load tokens" body={error} />
        ) : loading && !feed ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 h-40 skeleton" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={
              search
                ? "No tokens match your search"
                : sort === "watchlist"
                ? "Watchlist is empty"
                : "No tokens yet"
            }
            body={
              search
                ? "Try a different name or symbol."
                : sort === "watchlist"
                ? "Tap the star on any token card to add it here."
                : "Be the first to launch on LitPump."
            }
            action={
              !search ? (
                <Link href="/create" className="btn btn-primary">
                  <Rocket size={16} /> Launch the first token
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePage.map((t) => (
              <TokenCard key={t.token} t={asTokenItem(t)} />
            ))}
          </div>
        )}

        {visible.length > PAGE_SIZE && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onChange={setPage}
          />
        )}

        <div className="mt-4 text-xs text-zinc-500 text-center">
          Showing {visible.length === 0 ? 0 : pageStart + 1}–{Math.min(pageEnd, visible.length)} of {visible.length}
          {visible.length !== tokens.length ? ` (filtered from ${tokens.length})` : ""} · refreshes every 8s
        </div>
      </section>
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-base sm:text-lg font-bold text-zinc-100">{value}</div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-12 text-center">
      <div className="text-lg font-bold">{title}</div>
      <div className="mt-1.5 text-sm text-zinc-500 max-w-md mx-auto">{body}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  // Build a compact page list with ellipses for very long ranges.
  const pages: (number | "...")[] = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: (number | "...")[] = [1];
    if (page > 3) out.push("...");
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) out.push(p);
    if (page < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  })();

  const btn = "min-w-[34px] h-[34px] px-2 rounded-md text-sm font-medium transition";

  return (
    <div className="mt-6 flex items-center justify-center gap-1.5 flex-wrap">
      <button
        type="button"
        className={`${btn} bg-bg-soft border border-bg-border text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-400`}
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        ←
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-1 text-zinc-600">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`${btn} border ${
              p === page
                ? "bg-accent text-bg border-accent"
                : "bg-bg-soft border-bg-border text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={`${btn} bg-bg-soft border border-bg-border text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-400`}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        →
      </button>
    </div>
  );
}
