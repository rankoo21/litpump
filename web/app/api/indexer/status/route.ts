import { NextResponse } from "next/server";
import { ensureFresh } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureFresh();
  return NextResponse.json({ ok: true });
}
