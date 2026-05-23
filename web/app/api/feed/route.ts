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
        // Allow downstream caches to reuse a single response for short bursts.
        "Cache-Control": "public, max-age=4, s-maxage=4, stale-while-revalidate=12",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to build feed" },
      { status: 500 }
    );
  }
}
