import { NextRequest, NextResponse } from "next/server";
import { ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // `?force=1` is sent by the trade widget right after a confirmed tx — it
  // bypasses the 12s TTL and blocks on a fresh rebuild so the next poll
  // already sees the new trade.
  const force = req.nextUrl.searchParams.get("force") === "1";
  await ensureFresh(force);
  return NextResponse.json({ ok: true });
}
