import { NextRequest, NextResponse } from "next/server";
import { recentTrades, curveStats24h, ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ curve: string }> }
) {
  await ensureFresh();
  const { curve } = await params;
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  return NextResponse.json(
    {
      trades: recentTrades(curve, limit),
      stats:  curveStats24h(curve),
    },
    {
      // Vercel CDN holds the response for 4s, lets the browser refresh after
      // 8s, and keeps serving stale up to 30s while a refresh is running.
      headers: { "Cache-Control": "public, s-maxage=4, max-age=8, stale-while-revalidate=30" },
    }
  );
}
