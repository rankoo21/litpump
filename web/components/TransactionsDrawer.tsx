"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useUserTransactions } from "@/lib/useUserTransactions";
import { fmtLtc, fmtTokens, timeAgo } from "@/lib/format";
import { TokenImage } from "./TokenImage";
import { liteForge } from "@/lib/chain";
import { ExternalLink, Receipt, Rocket, X } from "lucide-react";
import Link from "next/link";

const ZERO_TX = "0x" + "0".repeat(64);

export function TransactionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const { items, loading } = useUserTransactions(address);

  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the drawer is open so the page underneath stays put.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-bg-soft border-l border-bg-border shadow-2xl transition-transform flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="My transactions"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-bg-border bg-bg/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <Receipt size={16} /> My Transactions
            <span className="text-xs text-zinc-500 font-normal">({items.length})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded hover:bg-bg-elev"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — flex-1 + min-h-0 makes the inner scroller behave correctly inside a flex column. */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-bg-soft">
          {!isConnected ? (
            <EmptyMsg>Connect your wallet to see your activity.</EmptyMsg>
          ) : loading && items.length === 0 ? (
            <EmptyMsg>Loading…</EmptyMsg>
          ) : items.length === 0 ? (
            <EmptyMsg>No transactions yet. Try launching a token or trading on a curve.</EmptyMsg>
          ) : (
            <ul className="divide-y divide-bg-border">
              {items.map((it, i) => {
                const badgeClass =
                  it.kind === "buy"
                    ? "text-accent border-accent/30 bg-accent/5"
                    : it.kind === "sell"
                    ? "text-rose-400 border-rose-500/30 bg-rose-500/5"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/5";

                const detail =
                  it.kind === "launch"
                    ? "Token launched"
                    : `${fmtTokens(it.tokens)} ${it.symbol || ""} for ${fmtLtc(it.ltc, 4)} zkLTC`;

                const hasRealTx = it.tx && it.tx !== ZERO_TX;

                return (
                  <li key={`${it.tx}-${it.kind}-${i}`} className="px-4 py-3 hover:bg-bg-elev/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <TokenImage src={it.imageURI} symbol={it.symbol || "?"} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase ${badgeClass}`}
                          >
                            {it.kind === "launch" ? (
                              <span className="inline-flex items-center gap-1">
                                <Rocket size={9} /> Launch
                              </span>
                            ) : (
                              it.kind
                            )}
                          </span>
                          <Link
                            href={`/token/${it.token}`}
                            onClick={onClose}
                            className="font-semibold text-sm hover:text-accent truncate"
                          >
                            ${it.symbol || "TOKEN"}
                          </Link>
                          <span className="text-[10px] text-zinc-600 ml-auto whitespace-nowrap">
                            {timeAgo(it.ts)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-400 font-mono break-all">
                          {detail}
                        </div>
                        {hasRealTx && (
                          <div className="mt-1">
                            <a
                              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-200"
                              href={`${liteForge.blockExplorers.default.url}/tx/${it.tx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View on explorer <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center text-sm text-zinc-500">{children}</div>;
}
