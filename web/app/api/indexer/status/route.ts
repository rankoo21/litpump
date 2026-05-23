import { NextResponse } from "next/server";
import { startIndexer } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pinging this route triggers `startIndexer()` if it isn't already running and
 * returns a tiny status payload. The home page hits it on first render so the
 * background loop is guaranteed to be live regardless of which API route the
 * user lands on first.
 */
export async function GET() {
  startIndexer();
  return NextResponse.json({ ok: true });
}
