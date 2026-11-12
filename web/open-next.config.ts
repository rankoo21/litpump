import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// This keeps the existing Next.js App Router and route handlers intact while
// packaging them for Cloudflare Workers instead of Vercel functions.
export default defineCloudflareConfig({});
