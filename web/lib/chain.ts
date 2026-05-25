import { defineChain } from "viem";

/**
 * LitVM "LiteForge" testnet — EVM-compatible Arbitrum Orbit rollup secured by Litecoin.
 * Source: https://docs.litvm.com/
 */
export const liteForge = defineChain({
  id: 4441,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: {
      http:      ["https://liteforge.rpc.caldera.xyz/http"],
      webSocket: ["wss://liteforge.rpc.caldera.xyz"],
    },
    public: {
      http:      ["https://liteforge.rpc.caldera.xyz/http"],
      webSocket: ["wss://liteforge.rpc.caldera.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "LiteForge Explorer",
      url: "https://liteforge.explorer.caldera.xyz",
    },
  },
  testnet: true,
});
