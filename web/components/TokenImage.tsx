"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { safeImageUrl } from "@/lib/safeUrl";

/**
 * Resolve known URI schemes into something an `<img>` tag can safely load.
 * Re-exported for callers that previously imported from this module; new code
 * should prefer `safeImageUrl` directly.
 */
export function resolveURI(uri: string | undefined | null): string {
  return safeImageUrl(uri) ?? "";
}

/**
 * Heuristic: catch obviously-wrong URLs (search result pages, social previews, etc.)
 * Returns true when the URL is unlikely to be a directly-renderable image.
 */
export function looksLikeBadImageUrl(uri: string): boolean {
  if (!uri) return false;
  const lower = uri.toLowerCase();
  if (
    lower.includes("bing.com/images/search") ||
    lower.includes("google.com/search") ||
    lower.includes("duckduckgo.com/?q=") ||
    lower.includes("/search?")
  ) return true;
  return false;
}

type Size = "sm" | "md" | "lg" | "xl";
const SIZE_CLASS: Record<Size, string> = {
  sm: "w-10 h-10 text-xs rounded-lg",
  md: "w-20 h-20 text-2xl rounded-xl",
  lg: "w-24 h-24 text-3xl rounded-2xl",
  xl: "w-32 h-32 text-4xl rounded-2xl",
};

/**
 * Token avatar with graceful fallback:
 * - Renders <img> when URL is a safe http(s)/ipfs/ar image and load succeeds.
 * - Falls back to a colored monogram on any error or unsafe scheme.
 *   (`data:`, `javascript:`, etc. are always rejected by `safeImageUrl`.)
 */
export function TokenImage({
  src,
  symbol,
  size = "md",
  className,
}: {
  src: string;
  symbol: string;
  size?: Size;
  className?: string;
}) {
  const resolved = safeImageUrl(src);
  const initiallyValid = !!resolved && !looksLikeBadImageUrl(resolved);
  const [errored, setErrored] = useState(!initiallyValid);

  useEffect(() => {
    setErrored(!initiallyValid);
  }, [resolved, initiallyValid]);

  const showImage = !!resolved && !errored;
  const monogram = (symbol || "?").slice(0, 2).toUpperCase();
  const hue = hashHue(symbol);

  return (
    <div
      className={clsx(
        "shrink-0 overflow-hidden border border-bg-border flex items-center justify-center font-bold select-none",
        SIZE_CLASS[size],
        className
      )}
      style={
        showImage
          ? undefined
          : {
              background: `linear-gradient(135deg, hsl(${hue} 70% 18%), hsl(${(hue + 40) % 360} 60% 10%))`,
              color: `hsl(${hue} 80% 70%)`,
            }
      }
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved!}
          alt={symbol}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        <span>{monogram}</span>
      )}
    </div>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
