import { NextRequest, NextResponse } from "next/server";
import { recentTrades, curveStats24h } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ curve: string }> }
) {
  const { curve } = await params;
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  return NextResponse.json({
    trades: recentTrades(curve, limit),
    stats:  curveStats24h(curve),
  });
}
