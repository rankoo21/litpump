import { NextRequest, NextResponse } from "next/server";
import { liveTicker } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  return NextResponse.json({ trades: liveTicker(limit) });
}
