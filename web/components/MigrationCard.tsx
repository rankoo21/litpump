"use client";

import { useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CURVE_ABI } from "@/lib/abi";
import { liteForge } from "@/lib/chain";
import { CheckCircle2, ExternalLink, Rocket } from "lucide-react";
import { toast } from "sonner";
import type { Address } from "viem";

/**
 * Sidebar card that surfaces the curve's post-graduation state.
 *
 * - When the curve has graduated and a DEX router is configured, the curve will
 *   have auto-migrated in the same tx as the graduating buy. We show the LP
 *   pair address with an explorer link.
 * - When auto-migration was deferred (no router was set at graduation time),
 *   anyone may call `migrate()` once an operator configures a router. The
 *   button is rendered for convenience.
 */
export function MigrationCard({
  curve,
  graduated,
  migrated,
  lpPair,
}: {
  curve: Address;
  graduated: boolean;
  migrated: boolean;
  lpPair?: string;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: mining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      toast.success("Liquidity migrated to DEX");
      setHash(undefined);
    }
  }, [isSuccess]);

  if (!graduated) return null;

  const busy = isPending || mining;

  if (migrated && lpPair && lpPair !== "0x0000000000000000000000000000000000000000") {
    return (
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
          <CheckCircle2 size={14} /> Liquidity migrated
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          The curve graduated and seeded liquidity on the DEX. The LP tokens
          are locked at the configured recipient (default: burn address).
        </p>
        <a
          href={`${liteForge.blockExplorers.default.url}/address/${lpPair}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200"
        >
          View pool on explorer <ExternalLink size={11} />
        </a>
      </div>
    );
  }

  // Graduated but not yet migrated → likely the factory has no router configured.
  return (
    <div className="card p-4 space-y-3 border-amber-500/30">
      <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
        <Rocket size={14} /> Pending DEX migration
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        The curve has graduated. Liquidity will be seeded on the DEX once an
        operator configures a router on the factory; the funds are safely held
        by the curve until then.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          try {
            const h = await writeContractAsync({
              address: curve,
              abi: CURVE_ABI,
              functionName: "migrate",
              args: [],
            });
            setHash(h);
            toast.success("Migration submitted");
          } catch (err: any) {
            toast.error(err?.shortMessage || err?.message || "Migration failed");
          }
        }}
        className="btn btn-primary w-full"
      >
        {busy ? "Migrating…" : "Try migrate now"}
      </button>
      <p className="text-[10px] text-zinc-600">
        If no router is configured this will revert with <code>NoRouter</code>;
        funds remain untouched and you can retry later.
      </p>
    </div>
  );
}
