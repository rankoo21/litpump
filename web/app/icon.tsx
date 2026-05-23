import { ImageResponse } from "next/og";

// Renders /favicon as a 32x32 PNG. Mirrors the SVG logo concept (a green candle
// next to a white "Ł"), but compressed to a single bold "Ł" because fine
// detail like the wick doesn't survive 32px rasterisation.
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#040603",
          border: "1.5px solid #a3ff12",
          borderRadius: 7,
          color: "#f4f4f4",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.06em",
        }}
      >
        Ł
      </div>
    ),
    { ...size }
  );
}
