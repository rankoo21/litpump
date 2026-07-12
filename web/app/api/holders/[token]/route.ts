import { NextRequest, NextResponse } from "next/server";
import { topHolders } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));
  const holders = await topHolders(token, limit);
  return NextResponse.json(
    { holders },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=90" } }
  );
}
