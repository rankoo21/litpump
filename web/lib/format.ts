import { formatUnits } from "viem";

export function fmtLtc(value: bigint | undefined, decimals = 4): string {
  if (value === undefined) return "—";
  const s = formatUnits(value, 18);
  const [int, dec = ""] = s.split(".");
  return `${Number(int).toLocaleString()}${decimals > 0 ? "." + dec.padEnd(decimals, "0").slice(0, decimals) : ""}`;
}

export function fmtTokens(value: bigint | undefined, decimals = 2): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, 18));
  if (n >= 1_000_000_000) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function fmtPrice(priceX1e18: bigint | undefined): string {
  if (priceX1e18 === undefined) return "—";
  const n = Number(formatUnits(priceX1e18, 18));
  return fmtPriceNumber(n);
}

/**
 * Format a price as a human-readable decimal regardless of magnitude.
 * - >= 1     → 4 decimals (e.g. 1.2345)
 * - >= 0.01  → 6 decimals
 * - >= 1e-6  → 10 decimals
 * - < 1e-6   → expand the leading zeros in subscript-like form so users see the
 *              real number ("0.000000028") rather than scientific notation that
 *              looks broken to non-traders.
 */
export function fmtPriceNumber(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1)     return n.toFixed(4);
  if (n >= 0.01)  return n.toFixed(6);
  if (n >= 1e-6)  return n.toFixed(10);
  // Tiny prices (typical for memecoins on a virgin curve): render the leading
  // zeros explicitly. We allow up to 18 decimals.
  const fixed = n.toFixed(18);
  // Trim trailing zeros but keep at least 4 significant digits after the run of zeros.
  const m = fixed.match(/^(0\.0*)(\d{1,4})/);
  if (!m) return fixed;
  return m[1] + m[2];
}

export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function timeAgo(unix: bigint | number | undefined): string {
  if (!unix) return "—";
  const t = typeof unix === "bigint" ? Number(unix) : unix;
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
