import type { RawTrade } from "@/lib/useTrades";

/**
 * Combine two trade lists (typically server indexer + direct RPC) into one
 * deduped, newest-first feed. Either side may be incomplete during cold
 * starts or rate-limit recoveries — merging means we never blink data the
 * other source already has.
 */
export function mergeTrades(...sources: Array<readonly RawTrade[] | undefined>): RawTrade[] {
  const seen = new Set<string>();
  const out: RawTrade[] = [];
  for (const list of sources) {
    if (!list) continue;
    for (const t of list) {
      const key = `${t.txHash}:${t.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  out.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });
  return out;
}
