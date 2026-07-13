"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { liteForge } from "./chain";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// Build wallet list: injected wallets always, plus WalletConnect ONLY if a real projectId is set.
const popular = [injectedWallet, metaMaskWallet, rabbyWallet, rainbowWallet, coinbaseWallet];
if (wcProjectId && wcProjectId.length === 32) popular.push(walletConnectWallet);

const connectors = connectorsForWallets(
  [{ groupName: "Popular", wallets: popular }],
  {
    appName: "LitPump",
    // RainbowKit requires a string here even if WC isn't used; passing a stub is safe
    // because no walletConnectWallet is registered above when the env var is missing.
    projectId: wcProjectId || "litpump-local",
  }
);

export const wagmiConfig = createConfig({
  chains: [liteForge],
  connectors,
  transports: {
    // LiteForge DOES have Multicall3 (0xcA11...CA11, declared in chain.ts), so
    // let wagmi batch multiple eth_calls made in the same tick into a single
    // aggregate request. Fewer round-trips = faster pages + far less RPC load.
    [liteForge.id]: http(liteForge.rpcUrls.default.http[0]),
  },
  batch: { multicall: true },
  // Cookie-backed storage so SSR doesn't crash trying to reach indexedDB.
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
