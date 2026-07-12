import { liteForge } from "@/lib/chain";

/**
 * LiteForge runs a Blockscout explorer with a REST API that returns already
 * indexed logs for any address in ~1s. That's dramatically faster and more
 * complete than scanning `eth_getLogs` over this chain's RPC (which is slow
 * even over narrow ranges), and it covers a contract's full history rather
 * than just a recent block window.
 *
 * We use it as the primary source for a curve's trade logs. It has no bearing
 * on the private RPC — it's a public read of the public explorer.
 */

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_API ||
  liteForge.blockExplorers?.default.url ||
  "https://liteforge.explorer.caldera.xyz";

export type ExplorerLog = {
  data: `0x${string}`;
  topics: (`0x${string}` | null)[];
  blockNumber: number;
  transactionHash: `0x${string}`;
  logIndex: number;
};

type RawLog = {
  data: string;
  topics: (string | null)[];
  block_number: number;
  transaction_hash: string;
  index: number;
};

/**
 * Fetch all logs emitted by `address`, newest first, following pagination up
 * to `maxPages` so we don't loop forever on very active contracts.
 */
export async function fetchAddressLogs(
  address: string,
  opts: { maxPages?: number; signal?: AbortSignal } = {},
): Promise<ExplorerLog[]> {
  const maxPages = opts.maxPages ?? 10;
  const base = `${EXPLORER_BASE}/api/v2/addresses/${address}/logs`;

  const out: ExplorerLog[] = [];
  let nextParams: Record<string, string> | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = nextParams
      ? `${base}?${new URLSearchParams(nextParams).toString()}`
      : base;

    const res = await fetch(url, {
      signal: opts.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) break;

    const json = (await res.json()) as {
      items?: RawLog[];
      next_page_params?: Record<string, string> | null;
    };
    const items = json.items ?? [];
    for (const it of items) {
      out.push({
        data:            (it.data ?? "0x") as `0x${string}`,
        topics:          (it.topics ?? []) as (`0x${string}` | null)[],
        blockNumber:     Number(it.block_number ?? 0),
        transactionHash: (it.transaction_hash ?? ("0x" + "0".repeat(64))) as `0x${string}`,
        logIndex:        Number(it.index ?? 0),
      });
    }

    if (!json.next_page_params) break;
    nextParams = json.next_page_params as Record<string, string>;
  }

  return out;
}

export type ExplorerHolder = { address: string; balance: string };

/**
 * Token holders straight from the explorer's indexed balances (sorted desc).
 * Far cheaper and more accurate than replaying Transfer logs + balanceOf.
 */
export async function fetchTokenHolders(
  token: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<ExplorerHolder[]> {
  const limit = opts.limit ?? 50;
  const url = `${EXPLORER_BASE}/api/v2/tokens/${token}/holders`;
  const res = await fetch(url, { signal: opts.signal, headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: Array<{ value?: string; address?: { hash?: string } }>;
  };
  const out: ExplorerHolder[] = [];
  for (const it of json.items ?? []) {
    const addr = it.address?.hash;
    const bal = it.value;
    if (!addr || !bal || bal === "0") continue;
    out.push({ address: addr.toLowerCase(), balance: bal });
  }
  // Explorer returns them sorted, but sort defensively (bigint desc).
  out.sort((a, b) => (BigInt(a.balance) === BigInt(b.balance) ? 0 : BigInt(a.balance) > BigInt(b.balance) ? -1 : 1));
  return out.slice(0, limit);
}
