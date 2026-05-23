import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED  = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Lightweight IPFS upload endpoint.
 *
 * Auth model: rate-limit by IP only. We deliberately do NOT require a wallet
 * signature for image uploads — image upload is a pre-creation step where the
 * user has not yet committed any on-chain action. Forcing a signature here
 * trains users to sign random prompts, which is bad for security long-term.
 *
 * The actual wallet signature happens on the launch transaction itself.
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "PINATA_JWT is not configured on the server. Add it to web/.env.local." },
      { status: 500 }
    );
  }

  // ---- Per-IP rate limit ----
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else if (bucket.count >= RATE_MAX) {
    return NextResponse.json(
      { error: "Too many uploads. Try again in a minute." },
      { status: 429 }
    );
  } else {
    bucket.count += 1;
  }

  // ---- File validation ----
  const form = (await req.formData()) as unknown as {
    get(name: string): FormDataEntryValue | null;
  };
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image is too large. Max 5MB." }, { status: 400 });
  }
  // Magic-byte sniff: defends against MIME spoofing.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
  const isWebp =
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  if (!isPng && !isJpg && !isGif && !isWebp) {
    return NextResponse.json(
      { error: "File content does not match a supported image format." },
      { status: 400 }
    );
  }

  // ---- Upload to Pinata ----
  const body = new FormData();
  body.append("file", file, "token-image");
  body.append("pinataMetadata", JSON.stringify({ name: `litpump-${Date.now()}` }));
  body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.details || data?.error || "Pinata upload failed." },
      { status: res.status }
    );
  }

  const cid = data.IpfsHash as string;
  return NextResponse.json({
    cid,
    ipfsUri:    `ipfs://${cid}`,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
  });
}
