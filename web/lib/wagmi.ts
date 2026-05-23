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
import { createConfig, http } from "wagmi";
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
    // LitVM LiteForge has no Multicall3 deployment, so we disable wagmi's
    // automatic batching. Each `useReadContract` becomes one `eth_call` —
    // slightly more RPC traffic, but correctness over micro-optimisation.
    [liteForge.id]: http(liteForge.rpcUrls.default.http[0], {
      batch: false,
    }),
  },
  // Disable multicall batching across the whole config too: a few hooks
  // (`useReadContracts`, balance polling) reach for it independently of the
  // transport setting.
  batch: { multicall: false },
  ssr: true,
});
