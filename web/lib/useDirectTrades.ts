"use client";

import { useEffect, useState } from "react";
import { createPublicClient, decodeEventLog, http, type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI } from "@/lib/abi";
import { fetchAddressLogs } from "@/lib/explorer";
import type { RawTrade } from "@/lib/useTrades";

/**
 * Load a curve's `Bought`/`Sold` history for the chart and trades table.
 *
 * Source is the Blockscout explorer API (already-indexed logs, full history,
 * ~1s) rather than scanning `eth_getLogs` over the RPC, which is slow on this
 * chain even for narrow ranges and only ever saw a recent window. Block
 * timestamps for the returned logs are resolved from the RPC in small batches.
 */
export function useDirectTrades(
  curve: Address | string | undefined,
  token: string,
  symbol: string,
  _createdAt?: number,
) {
  const [trades, setTrades] = useState<RawTrade[] | null>(null);

  useEffect(() => {
    if (!curve) return;
    let cancelled = false;
    const controller = new AbortController();
    const client = createPublicClient({
      chain:     liteForge,
      transport: http(liteForge.rpcUrls.default.http[0]),
    });

    (async () => {
      try {
        const logs = await fetchAddressLogs(String(curve), { signal: controller.signal });
        if (cancelled) return;

        // Decode Bought/Sold first so we only resolve timestamps for the
        // blocks we actually keep.
        type Decoded = { raw: (typeof logs)[number]; args: any; isBuy: boolean };
        const decoded: Decoded[] = [];
        for (const log of logs) {
          try {
            const parsed = decodeEventLog({
              abi:    CURVE_ABI,
              data:   log.data,
              topics: log.topics as any,
            }) as any;
            if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;
            decoded.push({ raw: log, args: parsed.args, isBuy: parsed.eventName === "Bought" });
          } catch { /* not our event */ }
        }

        // Resolve block timestamps in small batches.
        const blockNums = new Set<bigint>();
        for (const d of decoded) if (d.raw.blockNumber) blockNums.add(BigInt(d.raw.blockNumber));
        const blockTs = new Map<bigint, number>();
        const bnArr = [...blockNums];
        for (let i = 0; i < bnArr.length; i += 16) {
          const slice = bnArr.slice(i, i + 16);
          await Promise.all(
            slice.map(async (bn) => {
              try {
                const b = await client.getBlock({ blockNumber: bn });
                blockTs.set(bn, Number(b.timestamp));
              } catch {
                blockTs.set(bn, 0);
              }
            }),
          );
          if (cancelled) return;
        }

        const out: RawTrade[] = decoded.map(({ raw, args, isBuy }) => ({
          curve:        String(curve).toLowerCase(),
          token:        token.toLowerCase(),
          symbol,
          imageURI:     "",
          kind:         isBuy ? "buy" : "sell",
          who:          ((isBuy ? args.buyer : args.seller) as string).toLowerCase(),
          ltc:          ((isBuy ? args.ltcIn  : args.ltcOut) as bigint).toString(),
          tokens:       ((isBuy ? args.tokensOut : args.tokensIn) as bigint).toString(),
          priceX1e18:   (args.newPriceX1e18 as bigint).toString(),
          ltcCollected: (args.ltcCollected as bigint).toString(),
          tokensSold:   (args.tokensSold as bigint).toString(),
          ts:           blockTs.get(BigInt(raw.blockNumber)) ?? 0,
          blockNumber:  raw.blockNumber,
          txHash:       raw.transactionHash,
          logIndex:     raw.logIndex,
        }));

        out.sort((a, b) => b.ts - a.ts);
        if (!cancelled) setTrades(out);
      } catch {
        if (!cancelled) setTrades([]);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [curve, token, symbol]);

  return trades;
}
