"use client";

import { useEffect, useState } from "react";
import { createPublicClient, decodeEventLog, http, type Address, type Log } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI } from "@/lib/abi";
import type { RawTrade } from "@/lib/useTrades";

/**
 * One-shot direct RPC scan of a curve's `Bought`/`Sold` events. Used as an
 * instant fallback while the server-side indexer is still rebuilding from
 * cold-start. Once the React Query trades poll returns real data, the
 * subscriber can fall back to that.
 *
 * Looks at the most recent 50k blocks (~2 days at LiteForge block times).
 */
export function useDirectTrades(curve: Address | string | undefined, token: string, symbol: string) {
  const [trades, setTrades] = useState<RawTrade[] | null>(null);

  useEffect(() => {
    if (!curve) return;
    let cancelled = false;
    const client = createPublicClient({
      chain:     liteForge,
      transport: http(liteForge.rpcUrls.default.http[0]),
    });

    (async () => {
      try {
        const latest    = await client.getBlockNumber();
        const fromBlock = latest > 50_000n ? latest - 50_000n : 0n;
        const logs = await client.getLogs({
          address:   curve as Address,
          fromBlock,
          toBlock:   latest,
        });
        if (cancelled) return;

        const blockNums = new Set<bigint>();
        for (const l of logs) if (l.blockNumber) blockNums.add(l.blockNumber);
        const blockTs = new Map<bigint, number>();
        await Promise.all(
          [...blockNums].map(async (bn) => {
            try {
              const b = await client.getBlock({ blockNumber: bn });
              blockTs.set(bn, Number(b.timestamp));
            } catch {
              blockTs.set(bn, 0);
            }
          })
        );
        if (cancelled) return;

        const out: RawTrade[] = [];
        for (const log of logs as Log[]) {
          try {
            const parsed = decodeEventLog({
              abi:    CURVE_ABI,
              data:   log.data,
              topics: log.topics,
            }) as any;
            if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;

            const a     = parsed.args;
            const isBuy = parsed.eventName === "Bought";
            out.push({
              curve:        (curve as string).toLowerCase(),
              token:        token.toLowerCase(),
              symbol,
              imageURI:     "",
              kind:         isBuy ? "buy" : "sell",
              who:          ((isBuy ? a.buyer : a.seller) as string).toLowerCase(),
              ltc:          ((isBuy ? a.ltcIn  : a.ltcOut) as bigint).toString(),
              tokens:       ((isBuy ? a.tokensOut : a.tokensIn) as bigint).toString(),
              priceX1e18:   (a.newPriceX1e18 as bigint).toString(),
              ltcCollected: (a.ltcCollected as bigint).toString(),
              tokensSold:   (a.tokensSold as bigint).toString(),
              ts:           blockTs.get(log.blockNumber!) ?? 0,
              blockNumber:  Number(log.blockNumber!),
              txHash:       log.transactionHash as `0x${string}`,
              logIndex:     log.logIndex ?? 0,
            });
          } catch { /* not our event */ }
        }
        out.sort((a, b) => b.ts - a.ts);
        if (!cancelled) setTrades(out);
      } catch {
        if (!cancelled) setTrades([]);
      }
    })();

    return () => { cancelled = true; };
  }, [curve, token, symbol]);

  return trades;
}
