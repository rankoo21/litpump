import { defineChain } from "viem";

// Optionally override the public RPC with a private/dedicated endpoint via
// NEXT_PUBLIC_RPC_URL (HTTP) and NEXT_PUBLIC_WS_URL (WebSocket).
const PUBLIC_HTTP = "https://liteforge.rpc.caldera.xyz/http";
const PUBLIC_WS   = "wss://liteforge.rpc.caldera.xyz";

const HTTP_URL = process.env.NEXT_PUBLIC_RPC_URL || PUBLIC_HTTP;
const WS_URL   = process.env.NEXT_PUBLIC_WS_URL  || PUBLIC_WS;

/**
 * LitVM "LiteForge" testnet — EVM-compatible Arbitrum Orbit rollup secured
 * by Litecoin. https://docs.litvm.com/
 */
export const liteForge = defineChain({
  id: 4441,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: [HTTP_URL], webSocket: [WS_URL] },
    public:  { http: [HTTP_URL], webSocket: [WS_URL] },
  },
  blockExplorers: {
    default: {
      name: "LiteForge Explorer",
      url: "https://liteforge.explorer.caldera.xyz",
    },
  },
  testnet: true,
});
