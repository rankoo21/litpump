/**
 * Defence-in-depth URL helpers. Token metadata (twitter / telegram / website / imageURI)
 * is supplied by arbitrary users and stored on-chain unvalidated. We must never render
 * untrusted strings into href/src attributes without explicitly checking the scheme,
 * because React does not strip `javascript:` / `data:` / `vbscript:` URIs from href.
 */

const ALLOWED_HREF_SCHEMES = new Set(["http:", "https:"]);

/**
 * Returns the URL if it parses as a safe http(s) link, otherwise returns null.
 * Use for `<a href={safeUrl(value)}>` so callers can trivially skip rendering when null.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Auto-prefix bare domains so creators who type "example.com" still get a working link.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (!ALLOWED_HREF_SCHEMES.has(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const ALLOWED_IMG_SCHEMES = new Set(["http:", "https:"]);

/**
 * Returns the resolved image URL (after ipfs:// / ar:// scheme normalisation) if safe.
 * Rejects `data:` and `javascript:` to defend against SVG-with-script and href injection.
 */
export function safeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ipfs://")) {
    // Pinata's public gateway resolves our pins instantly. ipfs.io can take
    // 30-60s before a fresh CID propagates which makes the upload feel broken.
    return `https://gateway.pinata.cloud/ipfs/${trimmed.slice(7)}`;
  }
  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice(5)}`;
  }
  try {
    const u = new URL(trimmed);
    if (!ALLOWED_IMG_SCHEMES.has(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
