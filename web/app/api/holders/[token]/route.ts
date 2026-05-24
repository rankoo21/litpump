import { NextRequest, NextResponse } from "next/server";
import { topHolders, ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await ensureFresh();
  const { token } = await params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));
  return NextResponse.json(
    { holders: topHolders(token, limit) },
    { headers: { "Cache-Control": "public, s-maxage=4, max-age=8, stale-while-revalidate=30" } }
  );
}
