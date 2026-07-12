import { NextRequest, NextResponse } from "next/server";
import { curveTrades, statsFromTrades } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ curve: string }> }
) {
  const { curve } = await params;
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  const trades = await curveTrades(curve, limit);
  return NextResponse.json(
    {
      trades,
      stats: statsFromTrades(trades),
    },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } }
  );
}
