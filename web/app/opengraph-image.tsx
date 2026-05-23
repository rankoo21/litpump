import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "LitPump — Launch your memecoin on Litecoin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Site-wide OpenGraph card. Used as the fallback when individual pages don't
 * declare their own (e.g. when a token detail page hasn't shipped its custom
 * `opengraph-image.tsx` yet). Renders with edge runtime + system fonts so
 * sharing is fast and reliable.
 */
export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#08080d",
          backgroundImage:
            "radial-gradient(900px 500px at 80% -10%, rgba(163,255,18,0.15), transparent 55%)," +
            "radial-gradient(700px 500px at -10% 50%, rgba(43,124,255,0.10), transparent 55%)",
          color: "#f1f1f4",
          padding: "72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Top bar: logo + chain badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(180deg, #a3ff12 0%, #7fcc06 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d05",
              fontWeight: 900,
              fontSize: 36,
              letterSpacing: "-0.05em",
            }}
          >
            L
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            <span>Lit</span>
            <span style={{ color: "#a3ff12" }}>Pump</span>
          </div>

          <div
            style={{
              marginLeft: "auto",
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(163,255,18,0.3)",
              background: "rgba(163,255,18,0.08)",
              color: "#a3ff12",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            LiteForge Testnet · 4441
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 86,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Launch a memecoin
          </div>
          <div
            style={{
              fontSize: 86,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            on <span style={{ color: "#a3ff12" }}>LitVM</span>.
          </div>
          <div style={{ fontSize: 28, color: "#a8a8b3", marginTop: 8 }}>
            Bonding curves · anti-snipe · creator fee share · DEX migration on graduation.
          </div>
        </div>

        {/* Bottom badges */}
        <div style={{ display: "flex", gap: 12, fontSize: 18, color: "#a8a8b3" }}>
          {[
            "✓ 50% creator fee",
            "✓ Anti-snipe protection",
            "✓ Audited internally",
          ].map((b) => (
            <div
              key={b}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid #23232f",
                background: "rgba(20,20,29,0.6)",
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
