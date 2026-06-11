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
        // Edge-cache the feed so repeat loads don't re-run the function.
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to build feed" },
      { status: 500 }
    );
  }
}
