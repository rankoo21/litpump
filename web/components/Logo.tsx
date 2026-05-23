import * as React from "react";

/**
 * LitPump brand mark — variant **A: stylised "Ł" with a candle wick**.
 *
 * The Ł grounds the brand in Litecoin instantly. A small candlestick replaces
 * the diagonal slash so the mark also reads as "trading / pump". The body of
 * the candle uses the brand green and a thin white wick rises through it.
 *
 * Black background, neon green outline — confident, viral-friendly, and
 * recognisable at favicon size because the silhouette is just the Ł.
 */
export function Logo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="LitPump"
    >
      <defs>
        <linearGradient id="lp-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#101410" />
          <stop offset="1"   stopColor="#040603" />
        </linearGradient>
        <linearGradient id="lp-candle" x1="32" y1="14" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6ff5a" />
          <stop offset="1" stopColor="#7fcc06" />
        </linearGradient>
      </defs>

      {/* Rounded near-black tile with a neon outline. */}
      <rect x="0" y="0" width="64" height="64" rx="14" fill="url(#lp-bg)" />
      <rect
        x="0.75" y="0.75" width="62.5" height="62.5" rx="13.25"
        fill="none"
        stroke="#a3ff12"
        strokeWidth="1.5"
        strokeOpacity="0.85"
      />

      {/* The Ł stem + base, in confident off-white. */}
      <g
        stroke="#f4f4f4"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M24 14 L24 50 L46 50" />
      </g>

      {/* Candle body — replaces the Ł slash. Vertical green rectangle with a
          tiny white wick poking out the top, and a faint shadow at the base. */}
      <rect
        x="30"
        y="22"
        width="10"
        height="20"
        rx="2"
        fill="url(#lp-candle)"
        stroke="#0a0d05"
        strokeWidth="1.5"
      />
      {/* Wick */}
      <line
        x1="35" y1="22" x2="35" y2="14"
        stroke="#f4f4f4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Lower wick */}
      <line
        x1="35" y1="42" x2="35" y2="46"
        stroke="#f4f4f4"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
