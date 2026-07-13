import { NextResponse } from "next/server";
import { getFeed } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Returns the cached feed used by the home page, leaderboard, and the
/// graduation notifier. See `lib/feed.ts` for the cache strategy.
export async function GET() {
  try {
    const feed = await getFeed();
    return NextResponse.json(feed, {
      headers: {
        // Shared edge cache: every visitor is served the same cached feed for
        // the window, so the function runs a couple of times a minute at most
        // regardless of traffic. This is the main lever against CPU overage.
        "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to build feed" },
      { status: 500 }
    );
  }
}
