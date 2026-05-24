import { NextRequest, NextResponse } from "next/server";
import { userTransactions, userLaunches, ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  await ensureFresh();
  const { address } = await params;
  return NextResponse.json({
    trades: userTransactions(address, 100),
    launches: userLaunches(address),
  });
}
