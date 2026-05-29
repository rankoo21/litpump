import { liteForge } from "@/lib/chain";

/**
 * RPC URL for server-side code (indexer, feed builder).
 *
 * `PRIVATE_RPC_URL` is a server-only env var — it is NOT prefixed with
 * `NEXT_PUBLIC_`, so Next.js never inlines it into the client bundle. This is
 * where a dedicated/partner endpoint goes; it stays out of the browser.
 *
 * Falls back to the public RPC when unset (e.g. local dev without the secret).
 */
export function serverRpcUrl(): string {
  return process.env.PRIVATE_RPC_URL || liteForge.rpcUrls.default.http[0];
}
