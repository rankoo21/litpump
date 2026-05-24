import { NextRequest, NextResponse } from "next/server";
import { liveTicker, ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  await ensureFresh();
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  return NextResponse.json({ trades: liveTicker(limit) });
}
