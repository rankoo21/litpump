import { NextRequest, NextResponse } from "next/server";
import { listTokens, trendingByVolume, userLaunches } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Token listing endpoint backed by the local indexer.
 *
 * Query params:
 *  - sort = "new" | "trending"          (default "new")
 *  - limit = 1..200                     (default 100)
 *  - offset = 0..                       (default 0)
 *  - creator = 0x…                      (optional, filter by creator)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sort   = params.get("sort")  ?? "new";
  const limit  = Math.min(200, Math.max(1, Number(params.get("limit")) || 100));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const creator = params.get("creator");

  let tokens;
  if (creator) {
    tokens = userLaunches(creator);
  } else if (sort === "trending") {
    tokens = trendingByVolume(86_400, limit);
  } else {
    tokens = listTokens(limit, offset);
  }

  return NextResponse.json({ tokens });
}
