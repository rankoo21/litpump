import { ImageResponse } from "next/og";
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { liteForge } from "@/lib/chain";
import { CURVE_ABI, FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS } from "@/lib/contracts";

export const runtime = "edge";
export const alt = "Token on LitPump";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Per-token OpenGraph card. Reads the token's name/symbol/image and live curve
 * stats over RPC at request time and composites a shareable preview. Falls back
 * gracefully to a generic card if any read fails.
 */
export default async function TokenOG({ params }: { params: { address: string } }) {
  let name = "Token";
  let symbol = "";
  let imageURI = "";
  let creator: Address | undefined;
  let priceLabel = "—";
  let mcapLabel = "—";
  let progressPct = 0;
  let graduated = false;

  try {
    const client = createPublicClient({ chain: liteForge, transport: http() });
    const idx = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "tokenIndexPlusOne",
      args: [params.address as Address],
    }) as bigint;

    if (idx > 0n) {
      const info = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "getToken",
        args: [idx - 1n],
      })) as any;

      name     = info.name;
      symbol   = info.symbol;
      imageURI = info.imageURI;
      creator  = info.creator;

      const curve = info.curve as Address;
      const [price, mcap, progress, grad] = await Promise.all([
        client.readContract({ address: curve, abi: CURVE_ABI, functionName: "currentPriceX1e18" }) as Promise<bigint>,
        client.readContract({ address: curve, abi: CURVE_ABI, functionName: "marketCapLtc"      }) as Promise<bigint>,
        client.readContract({ address: curve, abi: CURVE_ABI, functionName: "graduationProgressX1e18" }) as Promise<bigint>,
        client.readContract({ address: curve, abi: CURVE_ABI, functionName: "graduated"        }) as Promise<boolean>,
      ]);

      const priceN = Number(formatUnits(price, 18));
      priceLabel = priceN >= 1
        ? priceN.toFixed(4)
        : priceN >= 0.01
        ? priceN.toFixed(6)
        : priceN >= 1e-6
        ? priceN.toFixed(10)
        : "<0.0000001";

      mcapLabel = Number(formatUnits(mcap, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 });
      progressPct = Math.min(100, Number(progress) / 1e16);
      graduated = grad;
    }
  } catch {
    /* swallow — render generic card */
  }

  // Resolve ipfs:// → Pinata gateway for the image render. ImageResponse can't
  // load arbitrary external resources reliably, so we keep this simple.
  const imageSrc = (() => {
    if (!imageURI) return null;
    if (imageURI.startsWith("ipfs://")) {
      return `https://gateway.pinata.cloud/ipfs/${imageURI.slice(7)}`;
    }
    if (imageURI.startsWith("https://")) return imageURI;
    return null;
  })();

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
          padding: "60px",
          display: "flex",
          flexDirection: "column",
          gap: 36,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: "linear-gradient(180deg, #a3ff12 0%, #7fcc06 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d05",
              fontWeight: 900,
              fontSize: 28,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, display: "flex" }}>
            <span>Lit</span>
            <span style={{ color: "#a3ff12" }}>Pump</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              padding: "6px 14px",
              borderRadius: 999,
              border: graduated ? "1px solid rgba(163,255,18,0.4)" : "1px solid #23232f",
              background: graduated ? "rgba(163,255,18,0.08)" : "rgba(20,20,29,0.6)",
              color: graduated ? "#a3ff12" : "#a8a8b3",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {graduated ? "✓ Graduated" : "Bonding curve"}
          </div>
        </div>

        {/* Token row */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 28,
              border: "1px solid #23232f",
              background: "#14141d",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#a3ff12",
              fontSize: 80,
              fontWeight: 900,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageSrc ? <img src={imageSrc} width={180} height={180} alt="" /> : symbol.slice(0, 2).toUpperCase() || "?"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 800 }}>
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 30, color: "#a8a8b3", display: "flex" }}>
              <span>${symbol}</span>
              {creator ? (
                <span style={{ marginLeft: 24, color: "#5a5a6a" }}>
                  by {creator.slice(0, 6)}…{creator.slice(-4)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginTop: "auto" }}>
          {[
            { label: "Price",       value: `${priceLabel} zkLTC` },
            { label: "Market cap",  value: `${mcapLabel} zkLTC`  },
            { label: "Graduation",  value: `${progressPct.toFixed(1)}%` },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                padding: "20px 24px",
                borderRadius: 18,
                border: "1px solid #23232f",
                background: "rgba(20,20,29,0.6)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 14, color: "#5a5a6a", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
