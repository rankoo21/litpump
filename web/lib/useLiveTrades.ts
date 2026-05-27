"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createPublicClient,
  decodeEventLog,
  webSocket,
  type Address,
  type Log,
} from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI } from "@/lib/abi";
import { pushPendingTrade, type RawTrade } from "@/lib/useTrades";

/**
 * Subscribe directly to a curve's `Bought` and `Sold` events over the chain's
 * WebSocket RPC. Pump.fun-style live updates: the chart and recent trades
 * re-render the moment a block lands, without waiting for the indexer poll.
 *
 * Falls back gracefully if the WS endpoint isn't reachable — the React Query
 * polls (every 8s) will keep things in sync regardless.
 */
export function useLiveTrades(curve: Address | string | undefined, token: Address | string, symbol: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!curve) return;
    const wsUrl = liteForge.rpcUrls.default.webSocket?.[0];
    if (!wsUrl) return;

    let unwatch: (() => void) | undefined;

    const client = createPublicClient({
      chain:     liteForge,
      transport: webSocket(wsUrl, { reconnect: true }),
    });

    try {
      unwatch = client.watchContractEvent({
        address:   curve as Address,
        abi:       CURVE_ABI,
        onLogs:    (logs: Log[]) => {
          for (const log of logs) {
            try {
              const parsed = decodeEventLog({
                abi:    CURVE_ABI,
                data:   log.data,
                topics: log.topics,
              }) as any;
              if (parsed.eventName !== "Bought" && parsed.eventName !== "Sold") continue;

              const a     = parsed.args;
              const isBuy = parsed.eventName === "Bought";
              const trade: RawTrade = {
                curve:        (curve as string).toLowerCase(),
                token:        (token as string).toLowerCase(),
                symbol,
                imageURI:     "",
                kind:         isBuy ? "buy" : "sell",
                who:          ((isBuy ? a.buyer : a.seller) as string).toLowerCase(),
                ltc:          ((isBuy ? a.ltcIn  : a.ltcOut) as bigint).toString(),
                tokens:       ((isBuy ? a.tokensOut : a.tokensIn) as bigint).toString(),
                priceX1e18:   (a.newPriceX1e18 as bigint).toString(),
                ltcCollected: (a.ltcCollected as bigint).toString(),
                tokensSold:   (a.tokensSold as bigint).toString(),
                ts:           Math.floor(Date.now() / 1000),
                blockNumber:  Number(log.blockNumber ?? 0),
                txHash:       (log.transactionHash ?? ("0x" + "0".repeat(64))) as `0x${string}`,
                logIndex:     Number(log.logIndex ?? 0),
              };
              pushPendingTrade(curve as string, trade);
            } catch { /* skip non-curve events */ }
          }
          // Ask every `useTrades` subscriber to re-render with the merged data,
          // and refresh holders too — a Bought/Sold log means balances moved.
          queryClient.invalidateQueries({ queryKey: ["trades",  curve] });
          queryClient.invalidateQueries({ queryKey: ["holders"] });
        },
        onError:   (err) => {
          // eslint-disable-next-line no-console
          console.warn("[live trades] WS error:", err);
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[live trades] subscribe failed:", err);
    }

    return () => {
      try { unwatch?.(); } catch { /* ignore */ }
    };
  }, [curve, token, symbol, queryClient]);
}
