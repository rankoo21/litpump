import { NextRequest, NextResponse } from "next/server";
import { topHolders, ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await ensureFresh();
  const { token } = await params;
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));
  return NextResponse.json({ holders: topHolders(token, limit) });
}
